import { defineTool, z } from 'deepruntime-cli';

/**
 * Example tool: Hello World
 * 
 * Use defineTool() for automatic type inference - no manual typing needed!
 */
export default defineTool({
  name: 'hello',
  description: 'Greet someone by name',
  schema: z.object({
    name: z.string().describe('Name of the person to greet'),
    language: z.enum(['zh', 'en']).default('zh').describe('Language: zh=Chinese, en=English'),
  }),
  func: async (args) => {
    // args.name and args.language are automatically typed!
    if (args.language === 'en') {
      return `Hello, ${args.name}! Welcome to DeepRuntime.`;
    }
    return `你好，${args.name}！欢迎使用 DeepRuntime。`;
  },
});
