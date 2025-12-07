import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { spawn, ChildProcess } from 'node:child_process';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { McpServerConfig } from '../types/index.js';

/**
 * MCP 客户端连接状态
 */
interface McpConnection {
  name: string;
  client: Client;
  transport: StdioClientTransport;
  process: ChildProcess;
  connected: boolean;
}

/**
 * MCP 工具信息（从 listTools 返回）
 */
interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * 将 JSON Schema 转换为 Zod Schema
 */
function jsonSchemaToZod(
  schema?: McpToolInfo['inputSchema']
): z.ZodObject<z.ZodRawShape> {
  if (!schema || !schema.properties) {
    return z.object({});
  }

  const shape: z.ZodRawShape = {};
  const properties = schema.properties as Record<string, { type?: string; description?: string }>;
  const required = new Set(schema.required || []);

  for (const [key, prop] of Object.entries(properties)) {
    let zodType: z.ZodTypeAny;

    switch (prop.type) {
      case 'string':
        zodType = z.string();
        break;
      case 'number':
      case 'integer':
        zodType = z.number();
        break;
      case 'boolean':
        zodType = z.boolean();
        break;
      case 'array':
        zodType = z.array(z.unknown());
        break;
      case 'object':
        zodType = z.record(z.unknown());
        break;
      default:
        zodType = z.unknown();
    }

    if (prop.description) {
      zodType = zodType.describe(prop.description);
    }

    if (!required.has(key)) {
      zodType = zodType.optional();
    }

    shape[key] = zodType;
  }

  return z.object(shape);
}

/**
 * MCP 客户端管理器
 *
 * 管理多个 MCP Server 连接，将远程工具转换为 LangChain 工具。
 *
 * @example
 * ```ts
 * const manager = new McpClientManager({
 *   filesystem: {
 *     command: 'npx',
 *     args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
 *   },
 * });
 *
 * await manager.connect();
 * const tools = manager.getTools();
 * await manager.disconnect();
 * ```
 */
export class McpClientManager {
  private servers: Record<string, McpServerConfig>;
  private connections: Map<string, McpConnection> = new Map();
  private tools: DynamicStructuredTool[] = [];

  constructor(servers: Record<string, McpServerConfig>) {
    this.servers = servers;
  }

  /**
   * 连接所有配置的 MCP Server
   */
  async connect(): Promise<void> {
    const serverNames = Object.keys(this.servers);

    if (serverNames.length === 0) {
      logger.debug('No MCP servers configured');
      return;
    }

    logger.info(`Connecting to ${serverNames.length} MCP server(s)...`);

    for (const [name, config] of Object.entries(this.servers)) {
      try {
        await this.connectServer(name, config);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to connect to MCP server "${name}": ${errorMessage}`);
        // 继续连接其他服务器
      }
    }

    // 加载所有连接服务器的工具
    await this.loadAllTools();

    const connectedCount = this.connections.size;
    if (connectedCount > 0) {
      logger.success(`Connected to ${connectedCount} MCP server(s)`);
    }
  }

  /**
   * 连接单个 MCP Server
   */
  private async connectServer(
    name: string,
    config: McpServerConfig
  ): Promise<void> {
    logger.debug(`Connecting to MCP server: ${name}`);

    // 合并环境变量，过滤掉 undefined 值
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...process.env, ...config.env })) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    // 启动子进程
    const childProcess = spawn(config.command, config.args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // 监听进程错误
    childProcess.on('error', (error) => {
      logger.error(`MCP server "${name}" process error: ${error.message}`);
      this.handleDisconnect(name);
    });

    childProcess.on('exit', (code) => {
      if (code !== 0) {
        logger.warn(`MCP server "${name}" exited with code ${code}`);
      }
      this.handleDisconnect(name);
    });

    // 创建传输层
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env,
    });

    // 创建客户端
    const client = new Client(
      {
        name: `deepruntime-${name}`,
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    // 连接
    await client.connect(transport);

    // 保存连接
    this.connections.set(name, {
      name,
      client,
      transport,
      process: childProcess,
      connected: true,
    });

    logger.debug(`Connected to MCP server: ${name}`);
  }

  /**
   * 处理断开连接
   */
  private handleDisconnect(name: string): void {
    const connection = this.connections.get(name);
    if (connection) {
      connection.connected = false;
      // 移除该服务器的工具
      this.tools = this.tools.filter(
        (tool) => !tool.name.startsWith(`mcp_${name}_`)
      );
    }
  }

  /**
   * 加载所有连接服务器的工具
   */
  private async loadAllTools(): Promise<void> {
    this.tools = [];

    for (const [name, connection] of this.connections) {
      if (!connection.connected) continue;

      try {
        const serverTools = await this.loadServerTools(name, connection.client);
        this.tools.push(...serverTools);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to load tools from "${name}": ${errorMessage}`);
      }
    }

    if (this.tools.length > 0) {
      logger.info(`Loaded ${this.tools.length} MCP tool(s)`);
    }
  }

  /**
   * 从单个服务器加载工具
   */
  private async loadServerTools(
    serverName: string,
    client: Client
  ): Promise<DynamicStructuredTool[]> {
    const result = await client.listTools();
    const tools: DynamicStructuredTool[] = [];

    for (const toolInfo of result.tools as McpToolInfo[]) {
      const tool = this.createLangChainTool(serverName, client, toolInfo);
      tools.push(tool);
      logger.debug(`Loaded MCP tool: mcp_${serverName}_${toolInfo.name}`);
    }

    return tools;
  }

  /**
   * 创建 LangChain 工具
   */
  private createLangChainTool(
    serverName: string,
    client: Client,
    toolInfo: McpToolInfo
  ): DynamicStructuredTool {
    const toolName = `mcp_${serverName}_${toolInfo.name}`;
    const schema = jsonSchemaToZod(toolInfo.inputSchema);

    return new DynamicStructuredTool({
      name: toolName,
      description: toolInfo.description || `MCP tool: ${toolInfo.name}`,
      schema,
      func: async (input: Record<string, unknown>): Promise<string> => {
        try {
          logger.action(`Calling MCP tool: ${toolName}`);

          const result = await client.callTool({
            name: toolInfo.name,
            arguments: input,
          });

          // 处理返回结果
          if (result.content && Array.isArray(result.content)) {
            const textContent = result.content
              .filter((item): item is { type: 'text'; text: string } => 
                item.type === 'text'
              )
              .map((item) => item.text)
              .join('\n');

            if (textContent) {
              return textContent;
            }
          }

          return JSON.stringify(result, null, 2);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error(`MCP tool "${toolName}" failed: ${errorMessage}`);
          return `Error: MCP tool "${toolName}" failed - ${errorMessage}`;
        }
      },
    });
  }

  /**
   * 获取所有已加载的工具
   */
  getTools(): DynamicStructuredTool[] {
    return [...this.tools];
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const [name, connection] of this.connections) {
      status[name] = connection.connected;
    }
    return status;
  }

  /**
   * 检查是否有活跃连接
   */
  hasConnections(): boolean {
    for (const connection of this.connections.values()) {
      if (connection.connected) {
        return true;
      }
    }
    return false;
  }

  /**
   * 断开所有连接
   */
  async disconnect(): Promise<void> {
    logger.debug('Disconnecting from MCP servers...');

    for (const [name, connection] of this.connections) {
      try {
        await this.disconnectServer(name, connection);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.warn(`Error disconnecting from "${name}": ${errorMessage}`);
      }
    }

    this.connections.clear();
    this.tools = [];
    logger.debug('Disconnected from all MCP servers');
  }

  /**
   * 断开单个服务器连接
   */
  private async disconnectServer(
    name: string,
    connection: McpConnection
  ): Promise<void> {
    logger.debug(`Disconnecting from MCP server: ${name}`);

    try {
      // 关闭客户端连接
      await connection.client.close();
    } catch {
      // 忽略关闭错误
    }

    try {
      // 关闭传输层
      await connection.transport.close();
    } catch {
      // 忽略关闭错误
    }

    // 终止子进程
    if (connection.process && !connection.process.killed) {
      connection.process.kill('SIGTERM');
    }

    connection.connected = false;
  }
}

/**
 * 创建 MCP 客户端管理器
 */
export function createMcpClientManager(
  servers?: Record<string, McpServerConfig>
): McpClientManager {
  return new McpClientManager(servers || {});
}

