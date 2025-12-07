/**
 * DeepRuntime CLI
 * Config-as-Code Agent Runtime Engine
 */

// 导出类型
export type {
  DeepConfig,
  AgentConfig,
  ToolsConfig,
  RuntimeConfig,
  ModelConfig,
  McpServerConfig,
  LocalToolDefinition,
} from './types/index.js';

// 导出 Schema（用于外部验证）
export {
  DeepConfigSchema,
  AgentConfigSchema,
  ToolsConfigSchema,
  RuntimeConfigSchema,
  ModelConfigSchema,
  McpServerConfigSchema,
  LocalToolDefinitionSchema,
  defineConfig,
} from './types/index.js';

