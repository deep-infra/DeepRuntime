import chalk from 'chalk';

/**
 * Log level type
 */
export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'thought' | 'action' | 'observation';

/**
 * Get current timestamp
 */
function getTimestamp(): string {
  const now = new Date();
  return chalk.gray(`[${now.toLocaleTimeString()}]`);
}

/**
 * DeepRuntime CLI colored logging utility
 * 
 * Provides visualization of agent thinking process, supports Windows/Mac/Linux
 */
export const logger = {
  /**
   * Info log (blue)
   * For general information output
   */
  info(message: string): void {
    console.log(`${getTimestamp()} ${chalk.blue('i')} ${chalk.blue(message)}`);
  },

  /**
   * Success log (green)
   * For successful operation notifications
   */
  success(message: string): void {
    console.log(`${getTimestamp()} ${chalk.green('v')} ${chalk.green(message)}`);
  },

  /**
   * Warning log (yellow)
   * For information that needs attention
   */
  warn(message: string): void {
    console.log(`${getTimestamp()} ${chalk.yellow('!')} ${chalk.yellow(message)}`);
  },

  /**
   * Error log (red)
   * For error message output
   */
  error(message: string): void {
    console.error(`${getTimestamp()} ${chalk.red('x')} ${chalk.red(message)}`);
  },

  /**
   * Thought log (cyan)
   * For agent's thinking/planning process
   */
  thought(message: string): void {
    console.log(`${getTimestamp()} ${chalk.cyan('~')} ${chalk.cyan(message)}`);
  },

  /**
   * Action log (magenta)
   * For agent tool invocations
   */
  action(message: string): void {
    console.log(`${getTimestamp()} ${chalk.magenta('>')} ${chalk.magenta(message)}`);
  },

  /**
   * Observation log (gray)
   * For tool execution results/observations
   */
  observation(message: string): void {
    console.log(`${getTimestamp()} ${chalk.gray('*')} ${chalk.gray(message)}`);
  },

  /**
   * Divider line
   * For visual separation
   */
  divider(): void {
    console.log(chalk.gray('-'.repeat(50)));
  },

  /**
   * Empty line
   */
  newline(): void {
    console.log();
  },

  /**
   * Title (bold white)
   */
  title(message: string): void {
    console.log();
    console.log(chalk.bold.white(`  ${message}`));
    console.log(chalk.gray('-'.repeat(50)));
  },

  /**
   * Subtitle (gray)
   */
  subtitle(message: string): void {
    console.log(chalk.gray(`  ${message}`));
  },

  /**
   * Raw output (no formatting)
   */
  raw(message: string): void {
    console.log(message);
  },

  /**
   * Agent response output (white, with indentation)
   */
  response(message: string): void {
    const lines = message.split('\n');
    lines.forEach(line => {
      console.log(chalk.white(`  ${line}`));
    });
  },

  /**
   * User input prompt
   */
  prompt(): void {
    process.stdout.write(chalk.bold.green('\nUser > '));
  },

  /**
   * Debug log (only outputs in DEBUG mode)
   */
  debug(message: string): void {
    if (process.env.DEBUG === 'true' || process.env.DEBUG === '1') {
      console.log(`${getTimestamp()} ${chalk.gray('?')} ${chalk.gray(`[DEBUG] ${message}`)}`);
    }
  },
};

// Default export
export default logger;
