import { defineConfig } from 'deepruntime-cli';

export default defineConfig({
  agent: {
    name: 'my-agent',
    systemPrompt: `你是一个智能助手，能够帮助用户完成各种任务。

## 你的能力
- 理解用户的需求并提供帮助
- 使用提供的工具获取信息和执行操作
- 进行多步骤的复杂任务规划和执行

## 行为准则
- 用中文回复用户
- 在执行操作前说明你的计划
- 如果不确定，请先询问用户

## 可用工具
你可以使用 src/tools/ 目录下定义的工具。运行时会自动加载这些工具。`,
    model: {
      provider: 'openai',
      modelName: 'deepseek-chat',
      configuration: {
        baseURL: 'https://api.deepseek.com/v1',
        apiKey: 'your-api-key-here',
      },
    },
  },

  tools: {
    localDir: './src/tools',
  },

  runtime: {
    timeout: 60000,
    sandbox: 'local',
    // 启用调试日志（显示详细的执行信息）
    // debug: true,
  },
});
