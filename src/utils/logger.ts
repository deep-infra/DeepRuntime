import chalk from 'chalk';

/**
 * 日志级别类型
 */
export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'thought' | 'action' | 'observation';

/**
 * 获取当前时间戳
 */
function getTimestamp(): string {
  const now = new Date();
  return chalk.gray(`[${now.toLocaleTimeString()}]`);
}

/**
 * DeepRuntime CLI 彩色日志工具
 * 
 * 提供 Agent 思考过程的可视化输出，支持 Windows/Mac/Linux
 * 
 * @example
 * ```ts
 * import { logger } from './utils/logger.js';
 * 
 * logger.info('Loading configuration...');
 * logger.success('Agent initialized!');
 * logger.thought('Planning approach for the task...');
 * logger.action('Calling tool: web_search');
 * logger.observation('Found 5 results');
 * ```
 */
export const logger = {
  /**
   * 信息日志 (蓝色)
   * 用于一般性信息输出
   */
  info(message: string): void {
    console.log(`${getTimestamp()} ${chalk.blue('ℹ')} ${chalk.blue(message)}`);
  },

  /**
   * 成功日志 (绿色)
   * 用于操作成功的提示
   */
  success(message: string): void {
    console.log(`${getTimestamp()} ${chalk.green('✔')} ${chalk.green(message)}`);
  },

  /**
   * 警告日志 (黄色)
   * 用于需要注意的信息
   */
  warn(message: string): void {
    console.log(`${getTimestamp()} ${chalk.yellow('⚠')} ${chalk.yellow(message)}`);
  },

  /**
   * 错误日志 (红色)
   * 用于错误信息输出
   */
  error(message: string): void {
    console.error(`${getTimestamp()} ${chalk.red('✖')} ${chalk.red(message)}`);
  },

  /**
   * 思考日志 (青色 + 💭)
   * 用于 Agent 的思考/规划过程
   */
  thought(message: string): void {
    console.log(`${getTimestamp()} ${chalk.cyan('💭')} ${chalk.cyan(message)}`);
  },

  /**
   * 行动日志 (洋红色 + ⚡)
   * 用于 Agent 执行工具调用
   */
  action(message: string): void {
    console.log(`${getTimestamp()} ${chalk.magenta('⚡')} ${chalk.magenta(message)}`);
  },

  /**
   * 观察日志 (灰色 + 👁)
   * 用于工具执行结果/观察
   */
  observation(message: string): void {
    console.log(`${getTimestamp()} ${chalk.gray('👁')} ${chalk.gray(message)}`);
  },

  /**
   * 分隔线
   * 用于视觉分隔
   */
  divider(): void {
    console.log(chalk.gray('─'.repeat(50)));
  },

  /**
   * 空行
   */
  newline(): void {
    console.log();
  },

  /**
   * 标题 (加粗白色)
   */
  title(message: string): void {
    console.log();
    console.log(chalk.bold.white(`  ${message}`));
    console.log(chalk.gray('─'.repeat(50)));
  },

  /**
   * 子标题 (灰色)
   */
  subtitle(message: string): void {
    console.log(chalk.gray(`  ${message}`));
  },

  /**
   * 原始输出 (无格式)
   */
  raw(message: string): void {
    console.log(message);
  },

  /**
   * Agent 响应输出 (白色，带缩进)
   */
  response(message: string): void {
    const lines = message.split('\n');
    lines.forEach(line => {
      console.log(chalk.white(`  ${line}`));
    });
  },

  /**
   * 用户输入提示
   */
  prompt(): void {
    process.stdout.write(chalk.bold.green('\nUser > '));
  },

  /**
   * 调试日志 (仅在 DEBUG 模式下输出)
   */
  debug(message: string): void {
    if (process.env.DEBUG === 'true' || process.env.DEBUG === '1') {
      console.log(`${getTimestamp()} ${chalk.gray('🔍')} ${chalk.gray(`[DEBUG] ${message}`)}`);
    }
  },
};

// 默认导出
export default logger;

