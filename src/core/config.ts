import { bundleRequire } from 'bundle-require';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { DeepConfig, DeepConfigSchema } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Configuration file name
 */
const CONFIG_FILE_NAME = 'deep.config.ts';

/**
 * Configuration loading error class
 */
export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Get API key from environment variables
 * Priority: DEEPSEEK_API_KEY > OPENAI_API_KEY > ANTHROPIC_API_KEY
 */
function getApiKeyFromEnv(): string | undefined {
  return (
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY
  );
}

/**
 * Merge API key from environment variables into config
 */
function mergeApiKeyFromEnv(config: DeepConfig): DeepConfig {
  // If apiKey is already in config, don't override
  if (config.agent.model.configuration?.apiKey) {
    return config;
  }

  const envApiKey = getApiKeyFromEnv();
  if (!envApiKey) {
    return config;
  }

  // Create new config object with merged apiKey from env
  return {
    ...config,
    agent: {
      ...config.agent,
      model: {
        ...config.agent.model,
        configuration: {
          ...config.agent.model.configuration,
          apiKey: envApiKey,
        },
      },
    },
  };
}

/**
 * Format Zod validation error
 */
function formatZodError(error: ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join('.');
    return `  - ${path}: ${issue.message}`;
  });
  return `Configuration validation failed:\n${issues.join('\n')}`;
}

/**
 * Load and validate configuration file
 *
 * @param cwd - Working directory, defaults to process.cwd()
 * @returns Validated DeepConfig object
 * @throws ConfigError when config file not found or validation fails
 */
export async function loadConfig(cwd?: string): Promise<DeepConfig> {
  const workDir = cwd || process.cwd();
  const configPath = resolve(workDir, CONFIG_FILE_NAME);

  // Check if config file exists
  if (!existsSync(configPath)) {
    throw new ConfigError(
      `Configuration file not found: ${CONFIG_FILE_NAME}\n` +
        `Expected location: ${configPath}\n\n` +
        `Run 'deep-run init' to create a new project with a config file.`
    );
  }

  logger.debug(`Loading config from: ${configPath}`);

  try {
    // Use bundle-require to dynamically load TypeScript config
    const { mod } = await bundleRequire({
      filepath: configPath,
      cwd: workDir,
    });

    // Get default export or named export
    const rawConfig = mod.default || mod;

    if (!rawConfig) {
      throw new ConfigError(
        `Configuration file must export a config object.\n` +
          `Example:\n` +
          `  export default defineConfig({ ... })`
      );
    }

    // Validate config with Zod schema
    let config: DeepConfig;
    try {
      config = DeepConfigSchema.parse(rawConfig);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ConfigError(formatZodError(error), error);
      }
      throw error;
    }

    // Merge API key from environment variables
    config = mergeApiKeyFromEnv(config);

    // Validate required configuration
    if (!config.agent.model.configuration?.apiKey) {
      logger.warn(
        'No API key found in config or environment variables.\n' +
          'Set DEEPSEEK_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in your environment,\n' +
          'or add apiKey to agent.model.configuration in deep.config.ts'
      );
    }

    // Log output (don't expose sensitive info)
    logger.debug(`Config loaded successfully`);
    logger.debug(`  Agent: ${config.agent.name || 'unnamed'}`);
    logger.debug(`  Model: ${config.agent.model.provider}/${config.agent.model.modelName}`);
    logger.debug(`  Tools dir: ${config.tools.localDir}`);
    logger.debug(`  MCP servers: ${Object.keys(config.tools.mcpServers || {}).length}`);

    return config;
  } catch (error) {
    // If already ConfigError, rethrow
    if (error instanceof ConfigError) {
      throw error;
    }

    // Wrap other errors
    const message =
      error instanceof Error ? error.message : String(error);
    throw new ConfigError(
      `Failed to load configuration file: ${CONFIG_FILE_NAME}\n` +
        `Error: ${message}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Check if configuration file exists
 */
export function configExists(cwd?: string): boolean {
  const workDir = cwd || process.cwd();
  const configPath = resolve(workDir, CONFIG_FILE_NAME);
  return existsSync(configPath);
}

/**
 * Get configuration file path
 */
export function getConfigPath(cwd?: string): string {
  const workDir = cwd || process.cwd();
  return resolve(workDir, CONFIG_FILE_NAME);
}
