/**
 * DeepRuntime 配置文件
 * 
 * 这是您的 Agent 的核心配置文件。
 * 使用 TypeScript 编写，享受类型检查和 IDE 智能提示。
 * 
 * 快速开始：
 * 1. 在下方 apiKey 处填入您的 API Key
 * 2. 运行 npm run dev 开始对话
 * 
 * 文档: https://github.com/deep-infra/DeepRuntime
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
     * DeepRuntime 支持任何 OpenAI 兼容的 API：
     */
    model: {
      // 模型提供商类型（使用 OpenAI 兼容接口）
      provider: 'openai',

      // 模型名称（根据您使用的平台填写）
      modelName: 'deepseek-chat',

      configuration: {
        // API 基础 URL（根据平台修改）
        baseURL: 'https://api.deepseek.com/v1',
        // API Key（在这里直接填入您的密钥）
        apiKey: 'your-api-key-here',

        // OpenAI
        // baseURL: 'https://api.openai.com/v1',
        // apiKey: 'sk-xxx',  // 从 https://platform.openai.com/ 获取
        
        // Ollama 本地运行（无需 API Key）
        // baseURL: 'http://localhost:11434/v1',
        // apiKey: 'ollama',  // Ollama 不需要真实 key，随便填
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

    // 启用调试日志（显示详细的执行信息）
    // debug: true,
  },
});
