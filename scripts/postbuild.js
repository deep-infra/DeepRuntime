#!/usr/bin/env node

/**
 * Post-build script
 * 
 * 1. 确保 CLI 入口文件有正确的 shebang
 * 2. 设置可执行权限（Unix 系统）
 */

import { readFile, writeFile, chmod, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const CLI_ENTRY = join(projectRoot, 'dist', 'bin', 'deep-run.js');
const SHEBANG = '#!/usr/bin/env node\n';

async function ensureShebang() {
  try {
    // 检查文件是否存在
    await access(CLI_ENTRY, constants.F_OK);
  } catch {
    console.log('CLI entry not found, skipping shebang check');
    return;
  }

  const content = await readFile(CLI_ENTRY, 'utf-8');
  
  // 检查是否已有 shebang
  if (!content.startsWith('#!')) {
    console.log('Adding shebang to CLI entry...');
    await writeFile(CLI_ENTRY, SHEBANG + content, 'utf-8');
    console.log('Shebang added');
  } else {
    console.log('Shebang already present');
  }

  // 在 Unix 系统上设置可执行权限
  if (process.platform !== 'win32') {
    try {
      await chmod(CLI_ENTRY, 0o755);
      console.log('Executable permission set');
    } catch (error) {
      console.warn('Could not set executable permission:', error.message);
    }
  }
}

async function main() {
  console.log('Running post-build tasks...');
  
  await ensureShebang();
  
  console.log('Post-build tasks completed');
}

main().catch((error) => {
  console.error('Post-build failed:', error);
  process.exit(1);
});

