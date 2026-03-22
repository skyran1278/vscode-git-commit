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

- Current git diff:
${context.diff}

- Current branch: ${context.branch}

- Recent commits:
${context.log}
${context.userMessage ? `\n- User instructions:\n${context.userMessage}\n` : ''}
## Your task

Generate a single git commit message for the above diff. Follow the style of the recent commits. If the recent commits don't follow a clear style, use the Conventional Commits format with these rules (@commitlint/config-conventional):
- Format: <type>(<optional scope>): <description>
- Allowed types: build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test
- Subject: lower-case, imperative mood, no trailing period
- Header (first line) max 100 characters
- Optional body separated by a blank line, wrapped at 100 characters
- Optional footer for BREAKING CHANGE or issue references
Output only the commit message with no code fences, quotes, or explanation.`;
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
