import { LLMStrategy } from './strategies';

export interface CommitContext {
  diff: string;
  status: string;
  branch: string;
  log: string;
  userMessage?: string;
}

export function buildPrompt(context: CommitContext): string {
  return `## Context

- Current git status:
${context.status}

- Current git diff (staged and unstaged changes):
${context.diff}

- Current branch: ${context.branch}

- Recent commits:
${context.log}
${context.userMessage ? `\n- User instructions:\n${context.userMessage}` : ''}
## Your task

Based on the above changes and commit history style, generate a single commit message. Output only the commit message, no code fences.`;
}

export async function generateCommitMessage(
  context: CommitContext,
  strategy: LLMStrategy,
): Promise<string> {
  const prompt = buildPrompt(context);
  const message = (await strategy.sendRequest(prompt)).trim();

  if (!message) {
    throw new Error('Language model returned an empty response');
  }
  return message;
}
