import { DynamicStructuredTool } from '@langchain/core/tools';
import { glob } from 'glob';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, basename } from 'node:path';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { LocalToolDefinition } from '../types/index.js';

/**
 * 验证工具导出结构是否有效
 */
function isValidToolExport(obj: unknown): obj is LocalToolDefinition {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const tool = obj as Record<string, unknown>;

  // 检查必要字段
  if (typeof tool.name !== 'string' || !tool.name) {
    return false;
  }
  if (typeof tool.description !== 'string') {
    return false;
  }
  if (!(tool.schema instanceof z.ZodObject)) {
    return false;
  }
  if (typeof tool.func !== 'function') {
    return false;
  }

  return true;
}

/**
 * 包装工具函数，添加 try-catch 错误处理
 */
function wrapToolFunc(
  name: string,
  func: LocalToolDefinition['func']
): (input: Record<string, unknown>) => Promise<string> {
  return async (input: Record<string, unknown>): Promise<string> => {
    try {
      const result = await func(input);
      // 确保返回字符串
      if (typeof result === 'string') {
        return result;
      }
      return JSON.stringify(result, null, 2);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Tool "${name}" execution failed: ${errorMessage}`);
      return `Error: Tool "${name}" failed - ${errorMessage}`;
    }
  };
}

/**
 * 将本地工具定义转换为 LangChain DynamicStructuredTool
 */
function convertToLangChainTool(
  toolDef: LocalToolDefinition
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: toolDef.name,
    description: toolDef.description,
    schema: toolDef.schema,
    func: wrapToolFunc(toolDef.name, toolDef.func),
  });
}

/**
 * 从文件加载工具定义
 */
async function loadToolFromFile(
  filePath: string
): Promise<LocalToolDefinition | null> {
  const fileName = basename(filePath);

  try {
    // 使用 file:// URL 进行动态导入（ESM 要求）
    const fileUrl = pathToFileURL(filePath).href;
    const module = await import(fileUrl);

    // 尝试获取默认导出或命名导出
    const toolExport = module.default || module;

    // 如果模块导出多个工具定义，取第一个有效的
    if (Array.isArray(toolExport)) {
      for (const item of toolExport) {
        if (isValidToolExport(item)) {
          return item;
        }
      }
      logger.warn(`Skipping ${fileName}: No valid tool definition found in array`);
      return null;
    }

    // 检查是否有效
    if (isValidToolExport(toolExport)) {
      return toolExport;
    }

    // 检查是否有 name, description, schema, func 作为单独导出
    const namedExport = {
      name: module.name,
      description: module.description,
      schema: module.schema,
      func: module.func,
    };

    if (isValidToolExport(namedExport)) {
      return namedExport as LocalToolDefinition;
    }

    logger.warn(
      `Skipping ${fileName}: Invalid export structure.\n` +
        `  Expected: { name: string, description: string, schema: ZodObject, func: Function }`
    );
    return null;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logger.warn(`Skipping ${fileName}: Failed to load - ${errorMessage}`);
    return null;
  }
}

/**
 * 加载目录下的所有本地工具
 *
 * 扫描指定目录下的 *.ts 文件，动态导入并验证工具定义，
 * 将有效的工具转换为 LangChain DynamicStructuredTool。
 *
 * @param dir - 工具目录路径（相对或绝对路径）
 * @param cwd - 工作目录，默认为 process.cwd()
 * @returns DynamicStructuredTool 数组
 *
 * @example
 * ```ts
 * import { loadLocalTools } from './tools/local-loader.js';
 *
 * const tools = await loadLocalTools('./src/tools');
 * console.log(`Loaded ${tools.length} tools`);
 * ```
 */
export async function loadLocalTools(
  dir: string,
  cwd?: string
): Promise<DynamicStructuredTool[]> {
  const workDir = cwd || process.cwd();
  const toolsDir = resolve(workDir, dir);

  // 检查目录是否存在
  if (!existsSync(toolsDir)) {
    logger.warn(`Tools directory not found: ${toolsDir}`);
    return [];
  }

  logger.debug(`Scanning tools directory: ${toolsDir}`);

  // 查找所有 .ts 文件（排除 .d.ts 和 index.ts）
  const pattern = '**/*.ts';
  const files = await glob(pattern, {
    cwd: toolsDir,
    absolute: true,
    ignore: ['**/*.d.ts', '**/index.ts', '**/*.test.ts', '**/*.spec.ts'],
  });

  if (files.length === 0) {
    logger.debug('No tool files found');
    return [];
  }

  logger.debug(`Found ${files.length} potential tool file(s)`);

  // 加载每个文件中的工具
  const tools: DynamicStructuredTool[] = [];
  const loadedNames = new Set<string>();

  for (const file of files) {
    const toolDef = await loadToolFromFile(file);

    if (toolDef) {
      // 检查工具名称是否重复
      if (loadedNames.has(toolDef.name)) {
        logger.warn(
          `Skipping duplicate tool "${toolDef.name}" from ${basename(file)}`
        );
        continue;
      }

      loadedNames.add(toolDef.name);
      const langchainTool = convertToLangChainTool(toolDef);
      tools.push(langchainTool);
      logger.debug(`Loaded tool: ${toolDef.name}`);
    }
  }

  logger.info(`Loaded ${tools.length} local tool(s)`);
  return tools;
}

/**
 * 获取工具目录中的工具文件列表
 */
export async function listToolFiles(
  dir: string,
  cwd?: string
): Promise<string[]> {
  const workDir = cwd || process.cwd();
  const toolsDir = resolve(workDir, dir);

  if (!existsSync(toolsDir)) {
    return [];
  }

  return glob('**/*.ts', {
    cwd: toolsDir,
    absolute: false,
    ignore: ['**/*.d.ts', '**/index.ts', '**/*.test.ts', '**/*.spec.ts'],
  });
}

