import { loadConfig, ConfigError } from '../core/config.js';
import { DeepRuntimeEngine } from '../core/engine.js';
import { logger } from '../utils/logger.js';

/**
 * start 命令选项
 */
interface StartOptions {
  task: string;
  timeout?: string;
}

/**
 * start 命令实现
 * 执行单次任务（无头模式），适合 CI/CD 和 Cron 任务
 */
export async function startCommand(options: StartOptions): Promise<void> {
  const { task, timeout } = options;
  let engine: DeepRuntimeEngine | null = null;

  // 验证必需参数
  if (!task || task.trim() === '') {
    logger.error('Task description is required. Use --task "your task description"');
    process.exit(1);
  }

  // 解析超时时间
  let timeoutMs: number | undefined;
  if (timeout) {
    timeoutMs = parseInt(timeout, 10);
    if (isNaN(timeoutMs) || timeoutMs <= 0) {
      logger.error('Invalid timeout value. Must be a positive number in milliseconds.');
      process.exit(1);
    }
  }

  // 优雅退出处理
  const shutdown = async (exitCode: number) => {
    if (engine) {
      await engine.shutdown();
    }
    process.exit(exitCode);
  };

  // 注册信号处理
  process.on('SIGINT', () => shutdown(130));
  process.on('SIGTERM', () => shutdown(143));

  try {
    // 1. 加载配置
    logger.info('Loading configuration...');

    let config;
    try {
      config = await loadConfig();
    } catch (error) {
      if (error instanceof ConfigError) {
        logger.error(error.message);
      } else {
        logger.error('Failed to load configuration');
        throw error;
      }
      process.exit(1);
    }

    // 合并超时配置
    if (timeoutMs) {
      config = {
        ...config,
        runtime: {
          ...config.runtime,
          timeout: timeoutMs,
        },
      };
    }

    // 2. 创建引擎
    engine = new DeepRuntimeEngine(config);

    // 3. 初始化引擎
    logger.info('Initializing agent...');

    try {
      await engine.initialize();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Initialization failed: ${message}`);
      process.exit(1);
    }

    // 4. 执行任务
    logger.info(`Executing task: ${task.substring(0, 100)}${task.length > 100 ? '...' : ''}`);
    logger.divider();

    let result: string;
    
    // 设置超时
    const timeoutPromise = timeoutMs
      ? new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Task timed out after ${timeoutMs}ms`)), timeoutMs)
        )
      : null;

    try {
      if (timeoutPromise) {
        result = await Promise.race([
          engine.runTask(task),
          timeoutPromise,
        ]);
      } else {
        result = await engine.runTask(task);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Task failed: ${message}`);
      await shutdown(1);
      return; // TypeScript 不知道 shutdown 会 exit
    }

    // 5. 输出结果
    logger.divider();
    logger.success('Task completed successfully');
    logger.newline();

    // 输出最终结果
    console.log(result);

    // 6. 清理并退出
    await shutdown(0);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error: ${message}`);
    await shutdown(1);
  }
}

