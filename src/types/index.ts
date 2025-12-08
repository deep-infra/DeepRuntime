import { z } from 'zod';

/**
 * MCP Server configuration schema
 * Defines connection parameters for external MCP servers
 */
export const McpServerConfigSchema = z.object({
  /** Command to start the MCP server */
  command: z.string(),
  /** Command arguments */
  args: z.array(z.string()),
  /** Environment variables */
  env: z.record(z.string()).optional(),
});

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

/**
 * Model configuration schema
 * Supports any model with OpenAI-compatible API
 */
export const ModelConfigSchema = z.object({
  /** Model provider */
  provider: z.enum(['openai', 'anthropic']),
  /** Model name, e.g. "deepseek-chat", "llama3", "gpt-4o" */
  modelName: z.string(),
  /** Model connection configuration */
  configuration: z
    .object({
      /** API base URL, e.g. "https://api.deepseek.com/v1" or "http://localhost:11434/v1" */
      baseURL: z.string().optional(),
      /** API key */
      apiKey: z.string().optional(),
    })
    .optional(),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/**
 * Agent configuration schema
 * Defines the agent's identity and brain
 */
export const AgentConfigSchema = z.object({
  /** Agent name */
  name: z.string().optional(),
  /** System prompt */
  systemPrompt: z.string(),
  /** Model configuration */
  model: ModelConfigSchema,
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Tools configuration schema
 * Defines tool sources
 */
export const ToolsConfigSchema = z.object({
  /** Local tools directory, e.g. "./src/tools" */
  localDir: z.string(),
  /** MCP server configuration map */
  mcpServers: z.record(McpServerConfigSchema).optional(),
});

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

/**
 * Runtime configuration schema
 */
export const RuntimeConfigSchema = z.object({
  /** Task timeout in milliseconds */
  timeout: z.number().optional(),
  /** Sandbox mode, MVP only supports "local" */
  sandbox: z.enum(['local']).optional(),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

/**
 * DeepConfig main configuration schema
 * This is the complete structure for deep.config.ts
 */
export const DeepConfigSchema = z.object({
  /** Agent configuration */
  agent: AgentConfigSchema,
  /** Tools configuration */
  tools: ToolsConfigSchema,
  /** Runtime configuration */
  runtime: RuntimeConfigSchema.optional(),
});

export type DeepConfig = z.infer<typeof DeepConfigSchema>;

/**
 * Local tool definition interface
 * Structure for tools exported from src/tools/*.ts
 */
export interface LocalToolDefinition {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Input parameters Zod schema */
  schema: z.ZodObject<z.ZodRawShape>;
  /** Tool execution function */
  func: (input: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Validate local tool definition
 */
export const LocalToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.instanceof(z.ZodObject),
  func: z.function(),
});

/**
 * Configuration helper function
 * Provides type inference and auto-completion
 */
export function defineConfig(config: DeepConfig): DeepConfig {
  return DeepConfigSchema.parse(config);
}
