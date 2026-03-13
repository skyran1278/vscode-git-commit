export interface LLMStrategy {
  sendRequest(prompt: string): Promise<string>;
}

export { ClaudeCliStrategy } from './claude-cli';
export { PerplexityStrategy } from './perplexity';
export { VscodeLmStrategy } from './vscode-lm';
