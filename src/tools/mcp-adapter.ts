import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { spawn, ChildProcess } from 'node:child_process';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { McpServerConfig } from '../types/index.js';

/**
 * MCP client connection state
 */
interface McpConnection {
  name: string;
  client: Client;
  transport: StdioClientTransport;
  process: ChildProcess;
  connected: boolean;
}

/**
 * MCP tool info (from listTools response)
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
 * Convert JSON Schema to Zod Schema
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
 * MCP Client Manager
 *
 * Manages multiple MCP server connections, converts remote tools to LangChain tools.
 */
export class McpClientManager {
  private servers: Record<string, McpServerConfig>;
  private connections: Map<string, McpConnection> = new Map();
  private tools: DynamicStructuredTool[] = [];

  constructor(servers: Record<string, McpServerConfig>) {
    this.servers = servers;
  }

  /**
   * Connect to all configured MCP servers
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
        // Continue connecting to other servers
      }
    }

    // Load tools from all connected servers
    await this.loadAllTools();

    const connectedCount = this.connections.size;
    if (connectedCount > 0) {
      logger.success(`Connected to ${connectedCount} MCP server(s)`);
    }
  }

  /**
   * Connect to single MCP server
   */
  private async connectServer(
    name: string,
    config: McpServerConfig
  ): Promise<void> {
    logger.debug(`Connecting to MCP server: ${name}`);

    // Merge environment variables, filter out undefined values
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...process.env, ...config.env })) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    // Start child process
    const childProcess = spawn(config.command, config.args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Listen for process errors
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

    // Create transport layer
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env,
    });

    // Create client
    const client = new Client(
      {
        name: `deepruntime-${name}`,
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    // Connect
    await client.connect(transport);

    // Save connection
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
   * Handle disconnection
   */
  private handleDisconnect(name: string): void {
    const connection = this.connections.get(name);
    if (connection) {
      connection.connected = false;
      // Remove tools from this server
      this.tools = this.tools.filter(
        (tool) => !tool.name.startsWith(`mcp_${name}_`)
      );
    }
  }

  /**
   * Load tools from all connected servers
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
   * Load tools from single server
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
   * Create LangChain tool
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

          // Process return result
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
   * Get all loaded tools
   */
  getTools(): DynamicStructuredTool[] {
    return [...this.tools];
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const [name, connection] of this.connections) {
      status[name] = connection.connected;
    }
    return status;
  }

  /**
   * Check if there are active connections
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
   * Disconnect all connections
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
   * Disconnect single server connection
   */
  private async disconnectServer(
    name: string,
    connection: McpConnection
  ): Promise<void> {
    logger.debug(`Disconnecting from MCP server: ${name}`);

    try {
      // Close client connection
      await connection.client.close();
    } catch {
      // Ignore close errors
    }

    try {
      // Close transport layer
      await connection.transport.close();
    } catch {
      // Ignore close errors
    }

    // Terminate child process
    if (connection.process && !connection.process.killed) {
      connection.process.kill('SIGTERM');
    }

    connection.connected = false;
  }
}

/**
 * Create MCP client manager
 */
export function createMcpClientManager(
  servers?: Record<string, McpServerConfig>
): McpClientManager {
  return new McpClientManager(servers || {});
}
