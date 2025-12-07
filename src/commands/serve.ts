import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { loadConfig, ConfigError } from '../core/config.js';
import { loadLocalTools } from '../tools/local-loader.js';

/**
 * 日志到 stderr（MCP Server 模式下不能使用 stdout）
 */
const log = {
  info: (msg: string) => console.error(`[INFO] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  debug: (msg: string) => {
    if (process.env.DEBUG === 'true' || process.env.DEBUG === '1') {
      console.error(`[DEBUG] ${msg}`);
    }
  },
};

/**
 * 将 Zod Schema 转换为 JSON Schema
 */
function zodToJsonSchema(zodSchema: DynamicStructuredTool['schema']): {
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
} {
  // 简单转换，获取 schema 的 shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schemaAny = zodSchema as any;
  const shape = (schemaAny.shape ?? {}) as Record<string, { description?: string; _def?: { typeName?: string } }>;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const typeName = value._def?.typeName || 'ZodString';
    let jsonType = 'string';

    if (typeName.includes('Number')) {
      jsonType = 'number';
    } else if (typeName.includes('Boolean')) {
      jsonType = 'boolean';
    } else if (typeName.includes('Array')) {
      jsonType = 'array';
    } else if (typeName.includes('Object')) {
      jsonType = 'object';
    }

    properties[key] = {
      type: jsonType,
      description: value.description || '',
    };

    // 检查是否必需（非 optional）
    if (!typeName.includes('Optional')) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

/**
 * serve 命令实现
 * 启动 MCP Server 模式，让 Cursor/Claude 等 IDE 调用本地工具
 */
export async function serveCommand(): Promise<void> {
  let tools: DynamicStructuredTool[] = [];
  const toolMap = new Map<string, DynamicStructuredTool>();

  try {
    // 1. 加载配置
    log.info('Loading configuration...');

    let config;
    try {
      config = await loadConfig();
    } catch (error) {
      if (error instanceof ConfigError) {
        log.error(error.message);
      } else {
        log.error('Failed to load configuration');
      }
      process.exit(1);
    }

    // 2. 加载本地工具
    log.info('Loading local tools...');
    tools = await loadLocalTools(config.tools.localDir, process.cwd());

    // 建立工具名称映射
    for (const tool of tools) {
      toolMap.set(tool.name, tool);
    }

    log.info(`Loaded ${tools.length} tool(s)`);

    // 3. 创建 MCP Server
    const server = new Server(
      {
        name: 'deepruntime',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // 4. 实现 ListTools 处理器
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      log.debug('Received ListTools request');

      return {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: zodToJsonSchema(tool.schema),
        })),
      };
    });

    // 5. 实现 CallTool 处理器
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      log.debug(`Received CallTool request: ${name}`);

      const tool = toolMap.get(name);

      if (!tool) {
        log.error(`Tool not found: ${name}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: Tool "${name}" not found`,
            },
          ],
          isError: true,
        };
      }

      try {
        // 执行工具
        const result = await tool.invoke(args || {});

        // 格式化结果
        const textResult = typeof result === 'string' 
          ? result 
          : JSON.stringify(result, null, 2);

        log.debug(`Tool ${name} completed successfully`);

        return {
          content: [
            {
              type: 'text',
              text: textResult,
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(`Tool ${name} failed: ${errorMessage}`);

        return {
          content: [
            {
              type: 'text',
              text: `Error: Tool "${name}" failed - ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });

    // 6. 连接 Stdio 传输
    log.info('Starting MCP server via stdio...');
    const transport = new StdioServerTransport();
    await server.connect(transport);

    log.info('MCP server is running. Waiting for requests...');

    // 保持进程运行
    process.on('SIGINT', async () => {
      log.info('Shutting down MCP server...');
      await server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      log.info('Shutting down MCP server...');
      await server.close();
      process.exit(0);
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`MCP server error: ${message}`);
    process.exit(1);
  }
}

