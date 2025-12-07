import { existsSync } from 'node:fs';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';

/**
 * init 命令选项
 */
interface InitOptions {
  force?: boolean;
  dir?: string;
}

/**
 * 需要创建的文件列表
 */
const FILES_TO_CREATE = [
  'deep.config.ts',
  'tsconfig.json',
  'package.json',
  'src/tools/example-tool.ts',
];

/**
 * 获取模板目录路径
 */
function getTemplatesDir(): string {
  // 获取当前模块的目录
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  
  // 模板目录相对于 dist/commands/ 或 src/commands/
  // 在构建后位于 dist/commands/，模板在 ../templates/
  const possiblePaths = [
    resolve(__dirname, '../../templates'),  // 从 dist/commands/ 到 templates/
    resolve(__dirname, '../../../templates'), // 开发模式
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  throw new Error('Templates directory not found');
}

/**
 * 检查文件是否存在
 */
async function checkExistingFiles(targetDir: string): Promise<string[]> {
  const existing: string[] = [];

  for (const file of FILES_TO_CREATE) {
    const filePath = resolve(targetDir, file);
    if (existsSync(filePath)) {
      existing.push(file);
    }
  }

  return existing;
}

/**
 * deep.config.ts 模板内容
 */
const CONFIG_TEMPLATE = `import { defineConfig } from 'deepruntime-cli';

/**
 * DeepRuntime 配置文件
 * 
 * 快速开始：
 * 1. 在下方 apiKey 处填入您的 API Key
 * 2. 运行 npm run dev 开始对话
 * 
 * 支持的平台：
 * - DeepSeek: https://api.deepseek.com/v1
 * - 硅基流动: https://api.siliconflow.cn/v1
 * - OpenAI: https://api.openai.com/v1
 * - Ollama: http://localhost:11434/v1
 */
export default defineConfig({
  agent: {
    name: 'my-agent',
    systemPrompt: \`你是一个智能助手，能够帮助用户完成各种任务。
你可以使用提供的工具来获取信息和执行操作。
请用中文回复用户。\`,
    model: {
      provider: 'openai',
      modelName: 'deepseek-chat',
      configuration: {
        // ========================================
        // 👇 在这里配置您的 API
        // ========================================
        baseURL: 'https://api.deepseek.com/v1',
        apiKey: 'your-api-key-here',

        // 硅基流动 SiliconFlow
        // baseURL: 'https://api.siliconflow.cn/v1',
        // apiKey: 'sk-xxx',

        // OpenAI
        // baseURL: 'https://api.openai.com/v1',
        // apiKey: 'sk-xxx',

        // Ollama 本地
        // baseURL: 'http://localhost:11434/v1',
        // apiKey: 'ollama',
      },
    },
  },
  tools: {
    localDir: './src/tools',
    // MCP Server 配置示例（取消注释以启用）
    // mcpServers: {
    //   filesystem: {
    //     command: 'npx',
    //     args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
    //   },
    // },
  },
  runtime: {
    timeout: 60000,
    sandbox: 'local',
  },
});
`;

/**
 * tsconfig.json 模板内容
 */
const TSCONFIG_TEMPLATE = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node"]
  },
  "include": ["src/**/*", "deep.config.ts"],
  "exclude": ["node_modules", "dist"]
}
`;

/**
 * package.json 模板内容
 */
const PACKAGE_TEMPLATE = `{
  "name": "my-deep-agent",
  "version": "1.0.0",
  "description": "My DeepRuntime Agent Project",
  "type": "module",
  "scripts": {
    "dev": "deep-run dev",
    "start": "deep-run start",
    "serve": "deep-run serve"
  },
  "dependencies": {
    "deepruntime-cli": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0"
  }
}
`;

/**
 * 示例工具模板内容
 */
const EXAMPLE_TOOL_TEMPLATE = `import { z } from 'zod';

/**
 * 示例工具：Hello World
 * 
 * 这是一个简单的示例工具，展示如何定义自定义工具。
 * 工具需要导出 { name, description, schema, func }
 */
export default {
  name: 'hello',
  description: '向用户打招呼的工具。输入名字，返回问候语。',
  schema: z.object({
    name: z.string().describe('要问候的名字'),
    language: z.enum(['zh', 'en']).default('zh').describe('问候语言'),
  }),
  func: async ({ name, language }: { name: string; language: 'zh' | 'en' }) => {
    if (language === 'en') {
      return \`Hello, \${name}! Welcome to DeepRuntime.\`;
    }
    return \`你好，\${name}！欢迎使用 DeepRuntime。\`;
  },
};
`;

/**
 * 创建文件
 */
async function createFile(
  filePath: string,
  content: string,
  force: boolean
): Promise<boolean> {
  const dir = dirname(filePath);

  // 创建目录
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  // 检查文件是否存在
  if (existsSync(filePath) && !force) {
    logger.warn(`Skipped: ${filePath} (already exists, use --force to overwrite)`);
    return false;
  }

  // 写入文件
  await writeFile(filePath, content, 'utf-8');
  logger.success(`Created: ${filePath}`);
  return true;
}

/**
 * init 命令实现
 */
export async function initCommand(options: InitOptions): Promise<void> {
  const targetDir = resolve(process.cwd(), options.dir || '.');
  const force = options.force || false;

  logger.title('DeepRuntime Init');
  logger.info(`Initializing project in: ${targetDir}`);
  logger.newline();

  // 检查已存在的文件
  if (!force) {
    const existing = await checkExistingFiles(targetDir);
    if (existing.length > 0) {
      logger.warn('The following files already exist:');
      existing.forEach((file) => logger.warn(`  - ${file}`));
      logger.warn('Use --force to overwrite existing files.');
      logger.newline();
    }
  }

  // 创建文件
  let createdCount = 0;

  // deep.config.ts
  if (await createFile(
    resolve(targetDir, 'deep.config.ts'),
    CONFIG_TEMPLATE,
    force
  )) {
    createdCount++;
  }

  // tsconfig.json
  if (await createFile(
    resolve(targetDir, 'tsconfig.json'),
    TSCONFIG_TEMPLATE,
    force
  )) {
    createdCount++;
  }

  // package.json
  if (await createFile(
    resolve(targetDir, 'package.json'),
    PACKAGE_TEMPLATE,
    force
  )) {
    createdCount++;
  }

  // src/tools/example-tool.ts
  if (await createFile(
    resolve(targetDir, 'src/tools/example-tool.ts'),
    EXAMPLE_TOOL_TEMPLATE,
    force
  )) {
    createdCount++;
  }

  // 输出结果
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
    logger.raw('     npm run start -- --task "你好"');
    logger.raw('');
  } else {
    logger.info('No files were created.');
  }
}

