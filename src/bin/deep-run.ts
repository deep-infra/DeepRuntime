#!/usr/bin/env node

/**
 * DeepRuntime CLI
 * Config-as-Code Agent Runtime Engine
 */

import { Command } from 'commander';
import { logger } from '../utils/logger.js';

// 创建 CLI 程序
const program = new Command();

program
  .name('deep-run')
  .description('Config-as-Code Agent Runtime Engine for developers')
  .version('1.0.0');

// init 命令
program
  .command('init')
  .description('Initialize a new DeepRuntime project')
  .option('-f, --force', 'Overwrite existing files')
  .option('-d, --dir <path>', 'Target directory', '.')
  .action(async (options) => {
    try {
      const { initCommand } = await import('../commands/init.js');
      await initCommand(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(message);
      process.exit(1);
    }
  });

// dev 命令
program
  .command('dev')
  .description('Start interactive development mode (REPL)')
  .action(async () => {
    try {
      const { devCommand } = await import('../commands/dev.js');
      await devCommand();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(message);
      process.exit(1);
    }
  });

// start 命令
program
  .command('start')
  .description('Execute a single task in headless mode')
  .requiredOption('-t, --task <task>', 'Task description to execute')
  .option('--timeout <ms>', 'Task timeout in milliseconds')
  .action(async (options) => {
    try {
      const { startCommand } = await import('../commands/start.js');
      await startCommand(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(message);
      process.exit(1);
    }
  });

// serve 命令
program
  .command('serve')
  .description('Start as MCP server for IDE integration')
  .action(async () => {
    try {
      const { serveCommand } = await import('../commands/serve.js');
      await serveCommand();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // serve 模式下使用 stderr
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// 解析命令行参数
program.parse();

