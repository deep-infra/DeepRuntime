import { loadConfig, ConfigError } from '../core/config.js';
import { DeepRuntimeEngine } from '../core/engine.js';
import { logger } from '../utils/logger.js';

/**
 * Simple loading spinner
 */
class Spinner {
  private frames = ['|', '/', '-', '\\'];
  private currentFrame = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    this.interval = setInterval(() => {
      process.stdout.write(`\r${this.frames[this.currentFrame]} ${this.message}`);
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
  }

  stop(success = true): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    // Clear current line
    process.stdout.write('\r' + ' '.repeat(this.message.length + 10) + '\r');
    
    if (success) {
      logger.success(this.message);
    }
  }

  fail(errorMessage: string): void {
    this.stop(false);
    logger.error(errorMessage);
  }
}

/**
 * dev command implementation
 * Start interactive development mode (REPL)
 */
export async function devCommand(): Promise<void> {
  let engine: DeepRuntimeEngine | null = null;

  // Graceful exit handler
  const shutdown = async () => {
    if (engine) {
      logger.newline();
      logger.info('Shutting down...');
      await engine.shutdown();
    }
    process.exit(0);
  };

  // Register signal handlers
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    // 1. Load configuration
    const configSpinner = new Spinner('Loading configuration...');
    configSpinner.start();

    let config;
    try {
      config = await loadConfig();
      configSpinner.stop();
    } catch (error) {
      if (error instanceof ConfigError) {
        configSpinner.fail(error.message);
      } else {
        configSpinner.fail('Failed to load configuration');
        throw error;
      }
      process.exit(1);
    }

    // 2. Create engine
    engine = new DeepRuntimeEngine(config);

    // 3. Initialize engine
    const initSpinner = new Spinner('Initializing agent...');
    initSpinner.start();

    try {
      await engine.initialize();
      initSpinner.stop();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      initSpinner.fail(`Initialization failed: ${message}`);
      process.exit(1);
    }

    // 4. Display tool info
    const tools = engine.getToolNames();
    logger.info(`Available tools: ${tools.length}`);
    if (tools.length > 0 && tools.length <= 10) {
      tools.forEach((name) => logger.debug(`  - ${name}`));
    } else if (tools.length > 10) {
      tools.slice(0, 5).forEach((name) => logger.debug(`  - ${name}`));
      logger.debug(`  ... and ${tools.length - 5} more`);
    }

    // 5. Start interactive mode
    await engine.runInteractive();

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error: ${message}`);

    if (engine) {
      await engine.shutdown();
    }

    process.exit(1);
  }
}
