# DeepRuntime CLI

> Config-as-Code Agent Runtime Engine for developers

DeepRuntime CLI 是一个面向独立开发者的轻量级 Agent 运行时引擎。通过 TypeScript 配置文件定义 Agent 行为，支持 DeepSeek、OpenAI、Ollama 等模型，并提供 MCP 协议双向集成。

## ✨ 特性

- **配置即代码**: 使用 `deep.config.ts` 定义 Agent，享受类型检查和 IDE 智能提示
- **模型中立**: 支持 DeepSeek（高性价比）、OpenAI、Ollama（本地隐私）等
- **MCP 双向支持**: 既能消费外部 MCP Server，也能作为 MCP Server 供 Cursor/Claude 调用
- **本地优先**: 无需 Docker，`npm start` 即可运行

## 🚀 快速开始

### 安装

```bash
npm install -g deepruntime-cli
```

### 初始化项目

```bash
mkdir my-agent && cd my-agent
deep-run init
```

### 配置 API Key

```bash
# 编辑 .env 文件
DEEPSEEK_API_KEY=your-api-key-here
```

### 开始对话

```bash
npm run dev
```

## 📖 命令

| 命令 | 描述 |
|------|------|
| `deep-run init` | 初始化新项目 |
| `deep-run dev` | 交互式开发模式 (REPL) |
| `deep-run start --task "..."` | 无头模式执行任务 |
| `deep-run serve` | MCP Server 模式 |

## ⚙️ 配置

```typescript
// deep.config.ts
import { defineConfig } from 'deepruntime-cli';

export default defineConfig({
  agent: {
    name: 'my-agent',
    systemPrompt: '你是一个智能助手...',
    model: {
      provider: 'openai',
      modelName: 'deepseek-chat',
      configuration: {
        baseURL: 'https://api.deepseek.com/v1',
      },
    },
  },
  tools: {
    localDir: './src/tools',
    mcpServers: {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
      },
    },
  },
});
```

## 🔧 自定义工具

在 `src/tools/` 目录下创建工具：

```typescript
// src/tools/my-tool.ts
import { z } from 'zod';

export default {
  name: 'my_tool',
  description: '工具描述',
  schema: z.object({
    input: z.string().describe('输入参数'),
  }),
  func: async ({ input }) => {
    return `处理结果: ${input}`;
  },
};
```

## 🔌 Cursor 集成

在 Cursor 的 MCP 设置中添加：

```json
{
  "mcpServers": {
    "deepruntime": {
      "command": "deep-run",
      "args": ["serve"]
    }
  }
}
```

## 📦 技术栈

- **Runtime**: Node.js + TypeScript
- **Agent**: deepagents + LangChain
- **Protocol**: @modelcontextprotocol/sdk
- **CLI**: commander + chalk

## 📄 License

MIT

