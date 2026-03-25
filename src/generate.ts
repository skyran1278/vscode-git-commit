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

Generate a single git commit message for the above diff.
Follow the style of the recent commits.
If the recent commits don't follow a clear style, use the Conventional Commits format below.

### Format

<type>[optional scope]: <description>

[optional body]

[optional footer]

### Allowed types

- feat: new feature
- fix: bug fix
- refactor: code change that neither fixes a bug nor adds a feature
- perf: performance improvement
- style: formatting, whitespace, missing semicolons (no logic change)
- docs: documentation only
- test: adding or correcting tests
- build: build system or external dependencies
- ci: CI configuration
- chore: maintenance tasks
- revert: revert a previous commit

### Description rules

- imperative, present tense, lowercase start, no trailing period
- immediately follows the colon and space
- header (type + scope + description) max 100 characters

### Body rules

- include body by default; omit only for trivial changes (typo fixes)
- blank line after description
- use "- " bullet points, never prose paragraphs
- imperative, present tense
- each line ≤ 80 characters
- explain the motivation (WHY), not just what changed

### Breaking changes

- add "!" after type/scope before ":" (e.g. feat! or refactor(api)!)
- or add a "BREAKING CHANGE:" footer (must be uppercase)
- required when: removing/renaming public fields or functions, changing function signatures, removing supported values

### Footer (optional)

- one blank line after body
- format: "Token: value" or "Token #value"

### Examples

fix(auth): add refresh token logic

- users were unexpectedly logged out when token expired silently

refactor(api)!: split User name into firstName and lastName

- downstream callers reading user.name will break; must migrate to firstName/lastName

### Common mistakes to avoid

- past tense ("Added", "Fixed") — use imperative ("add", "fix")
- trailing period in description
- body written as prose paragraph — use bullet points
- no body on non-trivial changes — always explain WHY
- "!" placed before scope — "!" goes after scope: feat(scope)!: ...
- lines exceeding 80 characters in body

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
