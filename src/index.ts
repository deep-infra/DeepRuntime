/**
 * DeepRuntime CLI
 * Config-as-Code Agent Runtime Engine
 */

// Export types
export type {
  DeepConfig,
  AgentConfig,
  ToolsConfig,
  RuntimeConfig,
  ModelConfig,
  McpServerConfig,
  LocalToolDefinition,
} from './types/index.js';

// Export schemas (for external validation)
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
