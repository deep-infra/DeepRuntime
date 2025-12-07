import { createInterface, Interface } from 'node:readline';
import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createDeepAgent } from 'deepagents';
import type { DeepConfig } from '../types/index.js';
import { loadLocalTools } from '../tools/local-loader.js';
import { McpClientManager } from '../tools/mcp-adapter.js';
import { logger } from '../utils/logger.js';

/**
 * Agent 事件类型
 */
interface AgentEvent {
  type: 'thought' | 'action' | 'observation' | 'response';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

/**
 * DeepRuntime Agent 引擎
 *
 * 核心运行时，负责：
 * - 加载和合并工具（本地、MCP、内置）
 * - 创建和管理 Agent
 * - 提供交互式 REPL 和无头任务执行
 *
 * @example
 * ```ts
 * const engine = new DeepRuntimeEngine(config);
 * await engine.initialize();
 * await engine.runInteractive();  // REPL 模式
 * // 或
 * const result = await engine.runTask('完成某项任务');
 * await engine.shutdown();
 * ```
 */
export class DeepRuntimeEngine {
  private config: DeepConfig;
  private llm: ChatOpenAI | null = null;
  private agent: ReturnType<typeof createDeepAgent> | null = null;
  private tools: DynamicStructuredTool[] = [];
  private mcpManager: McpClientManager | null = null;
  private readline: Interface | null = null;
  private isShuttingDown = false;
  private initialized = false;

  constructor(config: DeepConfig) {
    this.config = config;
  }

  /**
   * 初始化引擎
   * 加载工具、连接 MCP、创建 Agent
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Engine already initialized');
      return;
    }

    logger.title('DeepRuntime CLI');
    logger.subtitle(`Agent: ${this.config.agent.name || 'unnamed'}`);
    logger.newline();

    // 1. 创建 LLM 实例
    await this.initializeLLM();

    // 2. 加载工具
    await this.loadTools();

    // 3. 创建 Agent
    await this.createAgent();

    this.initialized = true;
    logger.success('Engine initialized successfully');
    logger.info(`Total tools: ${this.tools.length}`);
  }

  /**
   * 初始化 LLM
   */
  private async initializeLLM(): Promise<void> {
    logger.info('Initializing LLM...');

    const modelConfig = this.config.agent.model;
    const configuration = modelConfig.configuration || {};

    // 验证 API Key
    if (!configuration.apiKey) {
      throw new Error(
        'API key is required. Set it in config or environment variables.'
      );
    }

    this.llm = new ChatOpenAI({
      modelName: modelConfig.modelName,
      configuration: {
        baseURL: configuration.baseURL,
        apiKey: configuration.apiKey,
      },
      streaming: true,
    });

    logger.debug(`LLM: ${modelConfig.provider}/${modelConfig.modelName}`);
    if (configuration.baseURL) {
      logger.debug(`Base URL: ${configuration.baseURL}`);
    }
  }

  /**
   * 加载所有工具
   */
  private async loadTools(): Promise<void> {
    logger.info('Loading tools...');
    this.tools = [];

    // 1. 加载本地工具
    const localTools = await loadLocalTools(
      this.config.tools.localDir,
      process.cwd()
    );
    this.tools.push(...localTools);

    // 2. 加载 MCP 工具
    if (this.config.tools.mcpServers) {
      this.mcpManager = new McpClientManager(this.config.tools.mcpServers);
      await this.mcpManager.connect();
      const mcpTools = this.mcpManager.getTools();
      this.tools.push(...mcpTools);
    }

    // 3. deepagents 内置工具会在 createDeepAgent 时自动添加
    logger.debug(`Loaded ${this.tools.length} external tool(s)`);
  }

  /**
   * 创建 Agent
   */
  private async createAgent(): Promise<void> {
    logger.info('Creating agent...');

    if (!this.llm) {
      throw new Error('LLM not initialized');
    }

    this.agent = createDeepAgent({
      tools: this.tools,
      systemPrompt: this.config.agent.systemPrompt,
    });

    logger.debug('Agent created with deepagents framework');
  }

  /**
   * 运行交互式 REPL 模式
   */
  async runInteractive(): Promise<void> {
    if (!this.agent || !this.llm) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    logger.divider();
    logger.info('Interactive mode. Type "exit" or press Ctrl+C to quit.');
    logger.divider();

    // 创建 readline 接口
    this.readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // 处理 Ctrl+C
    this.setupSignalHandlers();

    // REPL 循环
    await this.replLoop();
  }

  /**
   * 设置信号处理
   */
  private setupSignalHandlers(): void {
    const handleShutdown = async () => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      logger.newline();
      logger.info('Shutting down...');

      if (this.readline) {
        this.readline.close();
      }

      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
  }

  /**
   * REPL 循环
   */
  private async replLoop(): Promise<void> {
    while (!this.isShuttingDown) {
      try {
        const userInput = await this.promptUser();

        if (!userInput) continue;

        // 检查退出命令
        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
          break;
        }

        // 执行任务
        await this.executeTask(userInput);
      } catch (error) {
        if (this.isShuttingDown) break;

        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(`Error: ${errorMessage}`);
      }
    }

    await this.shutdown();
  }

  /**
   * 提示用户输入
   */
  private promptUser(): Promise<string> {
    return new Promise((resolve) => {
      if (!this.readline || this.isShuttingDown) {
        resolve('');
        return;
      }

      logger.prompt();

      this.readline.once('line', (input) => {
        resolve(input.trim());
      });

      this.readline.once('close', () => {
        resolve('');
      });
    });
  }

  /**
   * 执行任务并流式输出
   */
  private async executeTask(input: string): Promise<string> {
    if (!this.agent) {
      throw new Error('Agent not initialized');
    }

    logger.newline();

    try {
      // 调用 agent
      const result = await this.agent.invoke({
        messages: [{ role: 'user', content: input }],
      });

      // 处理事件流
      this.processAgentEvents(result);

      // 获取最终响应
      const lastMessage = result.messages[result.messages.length - 1];
      const response = typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

      logger.newline();
      logger.divider();
      logger.response(response);
      logger.divider();

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Agent error: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * 处理 Agent 事件
   */
  private processAgentEvents(result: { messages: Array<{ role: string; content: unknown; name?: string }> }): void {
    for (const message of result.messages) {
      if (message.role === 'assistant') {
        // 思考内容
        if (typeof message.content === 'string' && message.content) {
          // 检查是否是工具调用
          if (message.name) {
            logger.action(`Tool: ${message.name}`);
          } else {
            logger.thought(message.content.substring(0, 200) + (message.content.length > 200 ? '...' : ''));
          }
        }
      } else if (message.role === 'tool') {
        // 工具结果
        const content = typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content);
        const truncated = content.length > 300
          ? content.substring(0, 300) + '...'
          : content;
        logger.observation(`Result: ${truncated}`);
      }
    }
  }

  /**
   * 执行单次任务（无头模式）
   */
  async runTask(task: string): Promise<string> {
    if (!this.agent || !this.llm) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    logger.info(`Executing task: ${task.substring(0, 100)}${task.length > 100 ? '...' : ''}`);
    logger.divider();

    try {
      const result = await this.executeTask(task);
      logger.success('Task completed');
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Task failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * 获取已加载的工具列表
   */
  getTools(): DynamicStructuredTool[] {
    return [...this.tools];
  }

  /**
   * 获取工具名称列表
   */
  getToolNames(): string[] {
    return this.tools.map((tool) => tool.name);
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 关闭引擎
   */
  async shutdown(): Promise<void> {
    logger.debug('Shutting down engine...');

    // 关闭 readline
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    // 断开 MCP 连接
    if (this.mcpManager) {
      await this.mcpManager.disconnect();
      this.mcpManager = null;
    }

    // 清理
    this.agent = null;
    this.llm = null;
    this.tools = [];
    this.initialized = false;

    logger.debug('Engine shutdown complete');
  }
}

/**
 * 创建 DeepRuntime 引擎实例
 */
export function createEngine(config: DeepConfig): DeepRuntimeEngine {
  return new DeepRuntimeEngine(config);
}

