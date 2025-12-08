import { DynamicStructuredTool } from '@langchain/core/tools';
import { bundleRequire } from 'bundle-require';
import { glob } from 'glob';
import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { LocalToolDefinition } from '../types/index.js';

/**
 * Validate if tool export structure is valid
 */
function isValidToolExport(obj: unknown): obj is LocalToolDefinition {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const tool = obj as Record<string, unknown>;

  // Check required fields
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
 * Wrap tool function with try-catch error handling
 */
function wrapToolFunc(
  name: string,
  func: LocalToolDefinition['func']
): (input: Record<string, unknown>) => Promise<string> {
  return async (input: Record<string, unknown>): Promise<string> => {
    try {
      const result = await func(input);
      // Ensure string return
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
 * Convert local tool definition to LangChain DynamicStructuredTool
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
 * Load tool definition from TypeScript file using bundle-require
 */
async function loadToolFromFile(
  filePath: string,
  cwd: string
): Promise<LocalToolDefinition | null> {
  const fileName = basename(filePath);

  try {
    // Use bundle-require to dynamically load TypeScript file
    const { mod } = await bundleRequire({
      filepath: filePath,
      cwd,
    });

    // Try to get default export or named export
    const toolExport = mod.default || mod;

    // If module exports multiple tool definitions, take first valid one
    if (Array.isArray(toolExport)) {
      for (const item of toolExport) {
        if (isValidToolExport(item)) {
          return item;
        }
      }
      logger.warn(`Skipping ${fileName}: No valid tool definition found in array`);
      return null;
    }

    // Check if valid
    if (isValidToolExport(toolExport)) {
      return toolExport;
    }

    // Check if name, description, schema, func are separate exports
    const namedExport = {
      name: mod.name,
      description: mod.description,
      schema: mod.schema,
      func: mod.func,
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
 * Load all local tools from directory
 *
 * Scans specified directory for *.ts files, dynamically imports and validates tool definitions,
 * converts valid tools to LangChain DynamicStructuredTool.
 *
 * @param dir - Tools directory path (relative or absolute)
 * @param cwd - Working directory, defaults to process.cwd()
 * @returns Array of DynamicStructuredTool
 */
export async function loadLocalTools(
  dir: string,
  cwd?: string
): Promise<DynamicStructuredTool[]> {
  const workDir = cwd || process.cwd();
  const toolsDir = resolve(workDir, dir);

  // Check if directory exists
  if (!existsSync(toolsDir)) {
    logger.warn(`Tools directory not found: ${toolsDir}`);
    return [];
  }

  logger.debug(`Scanning tools directory: ${toolsDir}`);

  // Find all .ts files (exclude .d.ts and index.ts)
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

  // Load tools from each file
  const tools: DynamicStructuredTool[] = [];
  const loadedNames = new Set<string>();

  for (const file of files) {
    const toolDef = await loadToolFromFile(file, workDir);

    if (toolDef) {
      // Check for duplicate tool names
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
 * Get list of tool files in directory
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
