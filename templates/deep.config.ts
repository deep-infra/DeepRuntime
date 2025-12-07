/**
 * DeepRuntime 配置文件
 * 
 * 这是您的 Agent 的核心配置文件。
 * 使用 TypeScript 编写，享受类型检查和 IDE 智能提示。
 * 
 * 快速开始：
 * 1. 复制 .env.example 为 .env
 * 2. 在 .env 中设置您的 DEEPSEEK_API_KEY
 * 3. 运行 npm run dev 开始对话
 * 
 * 文档: https://github.com/your-org/deepruntime-cli
 */

import { defineConfig } from 'deepruntime-cli';

export default defineConfig({
  /**
   * Agent 配置
   * 定义 Agent 的身份、行为和使用的模型
   */
  agent: {
    // Agent 名称（可选，用于日志和识别）
    name: 'my-agent',

    /**
     * 系统提示词
     * 定义 Agent 的角色、能力和行为准则
     * 
     * 提示：
     * - 明确 Agent 的角色和专长
     * - 说明可用的工具及其用途
     * - 设定输出格式和语言偏好
     */
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

    /**
     * 模型配置
     * 
     * DeepRuntime 支持任何 OpenAI 兼容的 API：
     * - DeepSeek: https://api.deepseek.com/v1 (推荐，高性价比)
     * - OpenAI: https://api.openai.com/v1
     * - Ollama: http://localhost:11434/v1 (本地运行)
     * - Azure OpenAI, Claude API (通过兼容层) 等
     */
    model: {
      // 模型提供商类型
      provider: 'openai',

      // 模型名称
      // DeepSeek: deepseek-chat, deepseek-reasoner
      // OpenAI: gpt-4o, gpt-4o-mini, gpt-3.5-turbo
      // Ollama: llama3, mistral, codellama 等
      modelName: 'deepseek-chat',

      configuration: {
        // API 基础 URL
        // DeepSeek API（默认，高性价比推荐）
        baseURL: 'https://api.deepseek.com/v1',

        // API Key 从环境变量读取
        // 在 .env 文件中设置 DEEPSEEK_API_KEY
        // 也支持 OPENAI_API_KEY 和 ANTHROPIC_API_KEY
      },
    },
  },

  /**
   * 工具配置
   * 定义 Agent 可以使用的工具来源
   */
  tools: {
    // 本地工具目录
    // Agent 会自动加载此目录下所有导出 { name, description, schema, func } 的 .ts 文件
    localDir: './src/tools',

    /**
     * MCP Server 配置（可选）
     * 连接外部 MCP Server 以使用更多工具
     * 
     * 示例：文件系统访问
     * mcpServers: {
     *   filesystem: {
     *     command: 'npx',
     *     args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
     *   },
     * },
     * 
     * 示例：PostgreSQL 数据库
     * mcpServers: {
     *   postgres: {
     *     command: 'npx',
     *     args: ['-y', '@modelcontextprotocol/server-postgres'],
     *     env: {
     *       DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
     *     },
     *   },
     * },
     */
    // mcpServers: {},
  },

  /**
   * 运行时配置（可选）
   */
  runtime: {
    // 任务超时时间（毫秒），默认 60 秒
    timeout: 60000,

    // 沙箱模式，MVP 版本仅支持 'local'
    sandbox: 'local',
  },
});

