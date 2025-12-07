/**
 * deepagents 模块类型声明
 * 
 * @see https://docs.langchain.com/oss/javascript/deepagents/quickstart
 */
declare module 'deepagents' {
  import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
  import type { StructuredToolInterface } from '@langchain/core/tools';

  export interface CreateDeepAgentParams {
    llm?: BaseChatModel;
    tools?: StructuredToolInterface[];
    prompt?: string;
    [key: string]: unknown;
  }

  export interface DeepAgent {
    invoke(input: { messages: Array<{ role: string; content: string }> }): Promise<{
      messages: Array<{ role: string; content: unknown; name?: string }>;
      [key: string]: unknown;
    }>;
    stream?(input: unknown): AsyncIterable<unknown>;
  }

  export function createDeepAgent(params: CreateDeepAgentParams): DeepAgent;
}

