import { bundleRequire } from 'bundle-require';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { DeepConfig, DeepConfigSchema } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * 配置文件名
 */
const CONFIG_FILE_NAME = 'deep.config.ts';

/**
 * 配置加载错误类
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
 * 从环境变量获取 API Key
 * 优先级: DEEPSEEK_API_KEY > OPENAI_API_KEY > ANTHROPIC_API_KEY
 */
function getApiKeyFromEnv(): string | undefined {
  return (
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY
  );
}

/**
 * 合并环境变量中的 API Key 到配置
 */
function mergeApiKeyFromEnv(config: DeepConfig): DeepConfig {
  // 如果配置中已有 apiKey，则不覆盖
  if (config.agent.model.configuration?.apiKey) {
    return config;
  }

  const envApiKey = getApiKeyFromEnv();
  if (!envApiKey) {
    return config;
  }

  // 创建新配置对象，合并环境变量中的 apiKey
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
 * 格式化 Zod 验证错误
 */
function formatZodError(error: ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join('.');
    return `  - ${path}: ${issue.message}`;
  });
  return `Configuration validation failed:\n${issues.join('\n')}`;
}

/**
 * 加载并验证配置文件
 *
 * @param cwd - 工作目录，默认为 process.cwd()
 * @returns 验证后的 DeepConfig 对象
 * @throws ConfigError 当配置文件不存在或验证失败时
 *
 * @example
 * ```ts
 * import { loadConfig } from './core/config.js';
 *
 * try {
 *   const config = await loadConfig();
 *   console.log(config.agent.name);
 * } catch (error) {
 *   if (error instanceof ConfigError) {
 *     console.error(error.message);
 *   }
 * }
 * ```
 */
export async function loadConfig(cwd?: string): Promise<DeepConfig> {
  const workDir = cwd || process.cwd();
  const configPath = resolve(workDir, CONFIG_FILE_NAME);

  // 检查配置文件是否存在
  if (!existsSync(configPath)) {
    throw new ConfigError(
      `Configuration file not found: ${CONFIG_FILE_NAME}\n` +
        `Expected location: ${configPath}\n\n` +
        `Run 'deep-run init' to create a new project with a config file.`
    );
  }

  logger.debug(`Loading config from: ${configPath}`);

  try {
    // 使用 bundle-require 动态加载 TypeScript 配置
    const { mod } = await bundleRequire({
      filepath: configPath,
      cwd: workDir,
    });

    // 获取默认导出或命名导出
    const rawConfig = mod.default || mod;

    if (!rawConfig) {
      throw new ConfigError(
        `Configuration file must export a config object.\n` +
          `Example:\n` +
          `  export default defineConfig({ ... })`
      );
    }

    // 使用 Zod Schema 验证配置
    let config: DeepConfig;
    try {
      config = DeepConfigSchema.parse(rawConfig);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ConfigError(formatZodError(error), error);
      }
      throw error;
    }

    // 合并环境变量中的 API Key
    config = mergeApiKeyFromEnv(config);

    // 验证必要的配置
    if (!config.agent.model.configuration?.apiKey) {
      logger.warn(
        'No API key found in config or environment variables.\n' +
          'Set DEEPSEEK_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in your environment,\n' +
          'or add apiKey to agent.model.configuration in deep.config.ts'
      );
    }

    // 日志输出（不暴露敏感信息）
    logger.debug(`Config loaded successfully`);
    logger.debug(`  Agent: ${config.agent.name || 'unnamed'}`);
    logger.debug(`  Model: ${config.agent.model.provider}/${config.agent.model.modelName}`);
    logger.debug(`  Tools dir: ${config.tools.localDir}`);
    logger.debug(`  MCP servers: ${Object.keys(config.tools.mcpServers || {}).length}`);

    return config;
  } catch (error) {
    // 如果已经是 ConfigError，直接抛出
    if (error instanceof ConfigError) {
      throw error;
    }

    // 包装其他错误
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
 * 检查配置文件是否存在
 */
export function configExists(cwd?: string): boolean {
  const workDir = cwd || process.cwd();
  const configPath = resolve(workDir, CONFIG_FILE_NAME);
  return existsSync(configPath);
}

/**
 * 获取配置文件路径
 */
export function getConfigPath(cwd?: string): string {
  const workDir = cwd || process.cwd();
  return resolve(workDir, CONFIG_FILE_NAME);
}

