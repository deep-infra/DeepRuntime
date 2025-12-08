import { createInterface, Interface } from 'node:readline';
import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createDeepAgent } from 'deepagents';
import type { DeepConfig } from '../types/index.js';
import { loadLocalTools } from '../tools/local-loader.js';
import { McpClientManager } from '../tools/mcp-adapter.js';
import { logger } from '../utils/logger.js';

/**
 * Agent event type
 */
interface AgentEvent {
  type: 'thought' | 'action' | 'observation' | 'response';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

/**
 * DeepRuntime Agent Engine
 */
export class DeepRuntimeEngine {
  private config: DeepConfig;
  private llm: ChatOpenAI | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private agent: any = null;
  private tools: DynamicStructuredTool[] = [];
  private mcpManager: McpClientManager | null = null;
  private readline: Interface | null = null;
  private isShuttingDown = false;
  private initialized = false;

  constructor(config: DeepConfig) {
    this.config = config;
  }

  /**
   * Initialize engine
   * Load tools, connect MCP, create agent
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Engine already initialized');
      return;
    }

    logger.title('DeepRuntime CLI');
    logger.subtitle(`Agent: ${this.config.agent.name || 'unnamed'}`);
    logger.newline();

    // 1. Create LLM instance
    await this.initializeLLM();

    // 2. Load tools
    await this.loadTools();

    // 3. Create agent
    await this.createAgent();

    this.initialized = true;
    logger.success('Engine initialized successfully');
    logger.info(`Total tools: ${this.tools.length}`);
  }

  /**
   * Initialize LLM
   */
  private async initializeLLM(): Promise<void> {
    logger.info('Initializing LLM...');

    const modelConfig = this.config.agent.model;
    const configuration = modelConfig.configuration || {};

    // Validate API key
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
   * Load all tools
   */
  private async loadTools(): Promise<void> {
    logger.info('Loading tools...');
    this.tools = [];

    // 1. Load local tools
    const localTools = await loadLocalTools(
      this.config.tools.localDir,
      process.cwd()
    );
    this.tools.push(...localTools);

    // 2. Load MCP tools
    if (this.config.tools.mcpServers) {
      this.mcpManager = new McpClientManager(this.config.tools.mcpServers);
      await this.mcpManager.connect();
      const mcpTools = this.mcpManager.getTools();
      this.tools.push(...mcpTools);
    }

    // 3. Built-in tools from deepagents are automatically added in createDeepAgent
    logger.debug(`Loaded ${this.tools.length} external tool(s)`);
  }

  /**
   * Create agent
   */
  private async createAgent(): Promise<void> {
    logger.info('Creating agent...');

    if (!this.llm) {
      throw new Error('LLM not initialized');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.agent = createDeepAgent({
      model: this.llm,
      tools: this.tools,
      prompt: this.config.agent.systemPrompt,
    } as any);

    logger.debug('Agent created with deepagents framework');
  }

  /**
   * Run interactive REPL mode
   */
  async runInteractive(): Promise<void> {
    if (!this.agent || !this.llm) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    logger.divider();
    logger.info('Interactive mode. Type "exit" or press Ctrl+C to quit.');
    logger.divider();

    // Create readline interface
    this.readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Handle Ctrl+C
    this.setupSignalHandlers();

    // REPL loop
    await this.replLoop();
  }

  /**
   * Setup signal handlers
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
   * REPL loop
   */
  private async replLoop(): Promise<void> {
    while (!this.isShuttingDown) {
      try {
        const userInput = await this.promptUser();

        if (!userInput) continue;

        // Check exit command
        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
          break;
        }

        // Execute task
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
   * Prompt user for input
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
   * Execute task with streaming output
   */
  private async executeTask(input: string): Promise<string> {
    if (!this.agent) {
      throw new Error('Agent not initialized');
    }

    logger.newline();

    try {
      // Invoke agent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (this.agent as any).invoke({
        messages: [{ role: 'user', content: input }],
      });

      // Process event stream
      this.processAgentEvents(result);

      // Get final response
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages = result.messages as any[];
      const lastMessage = messages[messages.length - 1];
      const response = typeof lastMessage?.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage?.content ?? '');

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
   * Process agent events
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processAgentEvents(result: any): void {
    const messages = (result?.messages ?? []) as Array<{ role?: string; content?: unknown; name?: string }>;
    for (const message of messages) {
      if (message.role === 'assistant') {
        // Thinking content
        if (typeof message.content === 'string' && message.content) {
          // Check if it's a tool call
          if (message.name) {
            logger.action(`Tool: ${message.name}`);
          } else {
            logger.thought(message.content.substring(0, 200) + (message.content.length > 200 ? '...' : ''));
          }
        }
      } else if (message.role === 'tool') {
        // Tool result
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
   * Execute single task (headless mode)
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
   * Get loaded tools list
   */
  getTools(): DynamicStructuredTool[] {
    return [...this.tools];
  }

  /**
   * Get tool names list
   */
  getToolNames(): string[] {
    return this.tools.map((tool) => tool.name);
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Shutdown engine
   */
  async shutdown(): Promise<void> {
    logger.debug('Shutting down engine...');

    // Close readline
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    // Disconnect MCP connections
    if (this.mcpManager) {
      await this.mcpManager.disconnect();
      this.mcpManager = null;
    }

    // Cleanup
    this.agent = null;
    this.llm = null;
    this.tools = [];
    this.initialized = false;

    logger.debug('Engine shutdown complete');
  }
}

/**
 * Create DeepRuntime engine instance
 */
export function createEngine(config: DeepConfig): DeepRuntimeEngine {
  return new DeepRuntimeEngine(config);
}
