/**
 * 示例工具：Hello World
 * 
 * 这是一个简单的示例，展示如何为 DeepRuntime 创建自定义工具。
 * 
 * 工具结构说明：
 * - name: 工具的唯一标识符（Agent 调用时使用）
 * - description: 工具的功能描述（帮助 Agent 理解何时使用此工具）
 * - schema: Zod Schema 定义输入参数（提供类型安全和验证）
 * - func: 工具的执行函数（接收验证后的输入，返回结果）
 * 
 * 创建更多工具：
 * 1. 在 src/tools/ 目录下创建新的 .ts 文件
 * 2. 导出符合上述结构的对象
 * 3. 重启 Agent，工具会自动加载
 */

import { z } from 'zod';

/**
 * Hello 工具
 * 向用户打招呼，支持中英文
 */
export default {
  // 工具名称（建议使用 snake_case）
  name: 'hello',

  // 工具描述（清晰描述功能，帮助 Agent 决定何时使用）
  description: '向指定的人打招呼。输入名字和语言，返回相应的问候语。',

  // 输入参数 Schema（使用 Zod 定义）
  schema: z.object({
    // 必需参数
    name: z
      .string()
      .describe('要问候的人的名字'),
    
    // 可选参数（带默认值）
    language: z
      .enum(['zh', 'en'])
      .default('zh')
      .describe('问候语言：zh=中文，en=英文'),
  }),

  // 工具执行函数
  // 参数类型会根据 schema 自动推断
  func: async ({ 
    name, 
    language 
  }: { 
    name: string; 
    language: 'zh' | 'en';
  }): Promise<string> => {
    // 根据语言返回不同的问候语
    if (language === 'en') {
      return `Hello, ${name}! Welcome to DeepRuntime. I'm your AI assistant, ready to help you with any task.`;
    }

    return `你好，${name}！欢迎使用 DeepRuntime。我是你的 AI 助手，随时准备帮助你完成各种任务。`;
  },
};

/**
 * 更多工具示例
 * 
 * 1. 获取当前时间：
 * 
 * export const getTime = {
 *   name: 'get_current_time',
 *   description: '获取当前时间',
 *   schema: z.object({
 *     timezone: z.string().optional().describe('时区，如 Asia/Shanghai'),
 *   }),
 *   func: async ({ timezone }) => {
 *     const date = new Date();
 *     return date.toLocaleString('zh-CN', { timeZone: timezone || 'Asia/Shanghai' });
 *   },
 * };
 * 
 * 2. 简单计算器：
 * 
 * export const calculator = {
 *   name: 'calculator',
 *   description: '执行基本的数学计算',
 *   schema: z.object({
 *     expression: z.string().describe('数学表达式，如 "2 + 2"'),
 *   }),
 *   func: async ({ expression }) => {
 *     // 注意：eval 有安全风险，仅作示例
 *     const result = eval(expression);
 *     return `${expression} = ${result}`;
 *   },
 * };
 * 
 * 3. 网络请求：
 * 
 * export const fetchUrl = {
 *   name: 'fetch_url',
 *   description: '获取指定 URL 的内容',
 *   schema: z.object({
 *     url: z.string().url().describe('要获取的 URL'),
 *   }),
 *   func: async ({ url }) => {
 *     const response = await fetch(url);
 *     return await response.text();
 *   },
 * };
 */

