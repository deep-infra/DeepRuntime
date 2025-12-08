import { loadConfig, ConfigError } from '../core/config.js';
import { DeepRuntimeEngine } from '../core/engine.js';
import { logger } from '../utils/logger.js';

/**
 * start command options
 */
interface StartOptions {
  task: string;
  timeout?: string;
}

/**
 * start command implementation
 * Execute single task (headless mode), suitable for CI/CD and cron jobs
 */
export async function startCommand(options: StartOptions): Promise<void> {
  const { task, timeout } = options;
  let engine: DeepRuntimeEngine | null = null;

  // Validate required parameters
  if (!task || task.trim() === '') {
    logger.error('Task description is required. Use --task "your task description"');
    process.exit(1);
  }

  // Parse timeout
  let timeoutMs: number | undefined;
  if (timeout) {
    timeoutMs = parseInt(timeout, 10);
    if (isNaN(timeoutMs) || timeoutMs <= 0) {
      logger.error('Invalid timeout value. Must be a positive number in milliseconds.');
      process.exit(1);
    }
  }

  // Graceful exit handler
  const shutdown = async (exitCode: number) => {
    if (engine) {
      await engine.shutdown();
    }
    process.exit(exitCode);
  };

  // Register signal handlers
  process.on('SIGINT', () => shutdown(130));
  process.on('SIGTERM', () => shutdown(143));

  try {
    // 1. Load configuration
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

    // Merge timeout configuration
    if (timeoutMs) {
      config = {
        ...config,
        runtime: {
          ...config.runtime,
          timeout: timeoutMs,
        },
      };
    }

    // 2. Create engine
    engine = new DeepRuntimeEngine(config);

    // 3. Initialize engine
    logger.info('Initializing agent...');

    try {
      await engine.initialize();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Initialization failed: ${message}`);
      process.exit(1);
    }

    // 4. Execute task
    logger.info(`Executing task: ${task.substring(0, 100)}${task.length > 100 ? '...' : ''}`);
    logger.divider();

    let result: string;
    
    // Set timeout
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
      return; // TypeScript doesn't know shutdown will exit
    }

    // 5. Output result
    logger.divider();
    logger.success('Task completed successfully');
    logger.newline();

    // Output final result
    console.log(result);

    // 6. Cleanup and exit
    await shutdown(0);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error: ${message}`);
    await shutdown(1);
  }
}
