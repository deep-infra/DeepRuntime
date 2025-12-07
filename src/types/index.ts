import { z } from 'zod';

/**
 * MCP Server 配置 Schema
 * 用于定义外部 MCP Server 的连接参数
 */
export const McpServerConfigSchema = z.object({
  /** 启动 MCP Server 的命令 */
  command: z.string(),
  /** 命令参数 */
  args: z.array(z.string()),
  /** 环境变量 */
  env: z.record(z.string()).optional(),
});

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

/**
 * 模型配置 Schema
 * 支持 OpenAI 兼容接口的任意模型
 */
export const ModelConfigSchema = z.object({
  /** 模型提供商 */
  provider: z.enum(['openai', 'anthropic']),
  /** 模型名称，如 "deepseek-chat", "llama3", "gpt-4o" */
  modelName: z.string(),
  /** 模型连接配置 */
  configuration: z
    .object({
      /** API 基础 URL，如 "https://api.deepseek.com/v1" 或 "http://localhost:11434/v1" */
      baseURL: z.string().optional(),
      /** API 密钥 */
      apiKey: z.string().optional(),
    })
    .optional(),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/**
 * Agent 配置 Schema
 * 定义 Agent 的身份和大脑
 */
export const AgentConfigSchema = z.object({
  /** Agent 名称 */
  name: z.string().optional(),
  /** 系统提示词 */
  systemPrompt: z.string(),
  /** 模型配置 */
  model: ModelConfigSchema,
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * 工具配置 Schema
 * 定义工具来源
 */
export const ToolsConfigSchema = z.object({
  /** 本地工具目录，如 "./src/tools" */
  localDir: z.string(),
  /** MCP Server 配置映射 */
  mcpServers: z.record(McpServerConfigSchema).optional(),
});

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

/**
 * 运行时配置 Schema
 */
export const RuntimeConfigSchema = z.object({
  /** 任务超时时间（毫秒） */
  timeout: z.number().optional(),
  /** 沙箱模式，MVP 仅支持 "local" */
  sandbox: z.enum(['local']).optional(),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

/**
 * DeepConfig 主配置 Schema
 * 这是 deep.config.ts 的完整结构
 */
export const DeepConfigSchema = z.object({
  /** Agent 配置 */
  agent: AgentConfigSchema,
  /** 工具配置 */
  tools: ToolsConfigSchema,
  /** 运行时配置 */
  runtime: RuntimeConfigSchema.optional(),
});

export type DeepConfig = z.infer<typeof DeepConfigSchema>;

/**
 * 本地工具定义接口
 * 用户在 src/tools/*.ts 中导出的工具结构
 */
export interface LocalToolDefinition {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 输入参数 Zod Schema */
  schema: z.ZodObject<z.ZodRawShape>;
  /** 工具执行函数 */
  func: (input: Record<string, unknown>) => Promise<unknown>;
}

/**
 * 验证本地工具定义
 */
export const LocalToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.instanceof(z.ZodObject),
  func: z.function(),
});

/**
 * 定义配置的辅助函数
 * 提供类型推断和自动补全
 */
export function defineConfig(config: DeepConfig): DeepConfig {
  return DeepConfigSchema.parse(config);
}

