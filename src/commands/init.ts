import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';

/**
 * init command options
 */
interface InitOptions {
  force?: boolean;
  dir?: string;
}

/**
 * Template files mapping
 * key: template path (relative to templates/)
 * value: target path (relative to project root)
 */
const TEMPLATE_FILES: Record<string, string> = {
  'deep.config.ts': 'deep.config.ts',
  'tsconfig.json': 'tsconfig.json',
  'package.json': 'package.json',
  'tools/example-tool.ts': 'src/tools/example-tool.ts',
};

/**
 * Get templates directory path
 */
function getTemplatesDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Template directory relative to compiled location
  // rslib bundles files, so we need to check multiple possible locations
  const possiblePaths = [
    // When running from dist/ (rslib bundled)
    resolve(__dirname, '../templates'),       // dist/ -> templates/
    resolve(__dirname, '../../templates'),    // dist/commands/ -> templates/
    resolve(__dirname, '../../../templates'), // deeper nesting
    // When running from source
    resolve(__dirname, '../../templates'),    // src/commands/ -> templates/
  ];

  // Also try to find package root by looking for package.json
  let currentDir = __dirname;
  for (let i = 0; i < 5; i++) {
    const packageJsonPath = resolve(currentDir, 'package.json');
    const templatesPath = resolve(currentDir, 'templates');
    if (existsSync(packageJsonPath) && existsSync(templatesPath)) {
      return templatesPath;
    }
    currentDir = dirname(currentDir);
  }

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  throw new Error('Templates directory not found');
}

/**
 * Check existing files in target directory
 */
async function checkExistingFiles(targetDir: string): Promise<string[]> {
  const existing: string[] = [];

  for (const targetPath of Object.values(TEMPLATE_FILES)) {
    const filePath = resolve(targetDir, targetPath);
    if (existsSync(filePath)) {
      existing.push(targetPath);
    }
  }

  return existing;
}

/**
 * Copy template file to target directory
 */
async function copyTemplateFile(
  templatesDir: string,
  targetDir: string,
  templatePath: string,
  targetPath: string,
  force: boolean
): Promise<boolean> {
  const srcPath = resolve(templatesDir, templatePath);
  const destPath = resolve(targetDir, targetPath);
  const destDir = dirname(destPath);

  // Check if template file exists
  if (!existsSync(srcPath)) {
    logger.warn(`Template not found: ${templatePath}`);
    return false;
  }

  // Create target directory
  if (!existsSync(destDir)) {
    await mkdir(destDir, { recursive: true });
  }

  // Check if target file exists
  if (existsSync(destPath) && !force) {
    logger.warn(`Skipped: ${targetPath} (already exists, use --force to overwrite)`);
    return false;
  }

  // Read and write file
  const content = await readFile(srcPath, 'utf-8');
  await writeFile(destPath, content, 'utf-8');
  logger.success(`Created: ${targetPath}`);
  return true;
}

/**
 * init command implementation
 */
export async function initCommand(options: InitOptions): Promise<void> {
  const targetDir = resolve(process.cwd(), options.dir || '.');
  const force = options.force || false;

  logger.title('DeepRuntime Init');
  logger.info(`Initializing project in: ${targetDir}`);
  logger.newline();

  // Get templates directory
  let templatesDir: string;
  try {
    templatesDir = getTemplatesDir();
  } catch (error) {
    logger.error('Failed to locate templates directory');
    process.exit(1);
  }

  // Check existing files
  if (!force) {
    const existing = await checkExistingFiles(targetDir);
    if (existing.length > 0) {
      logger.warn('The following files already exist:');
      existing.forEach((file) => logger.warn(`  - ${file}`));
      logger.warn('Use --force to overwrite existing files.');
      logger.newline();
    }
  }

  // Copy template files
  let createdCount = 0;

  for (const [templatePath, targetPath] of Object.entries(TEMPLATE_FILES)) {
    if (await copyTemplateFile(templatesDir, targetDir, templatePath, targetPath, force)) {
      createdCount++;
    }
  }

  // Output result
  logger.newline();
  logger.divider();

  if (createdCount > 0) {
    logger.success(`Project initialized! Created ${createdCount} file(s).`);
    logger.newline();
    logger.info('Next steps:');
    logger.raw('');
    logger.raw('  1. Configure your API key:');
    logger.raw('     # Edit deep.config.ts and set your apiKey');
    logger.raw('');
    logger.raw('  2. Install dependencies:');
    logger.raw('     npm install');
    logger.raw('');
    logger.raw('  3. Start interactive mode:');
    logger.raw('     npm run dev');
    logger.raw('');
    logger.raw('  Or run a single task:');
    logger.raw('     npm run start -- --task "hello"');
    logger.raw('');
  } else {
    logger.info('No files were created.');
  }
}
