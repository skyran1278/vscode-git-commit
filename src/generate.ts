import { LLMStrategy } from './strategies';

export interface CommitContext {
  diff: string;
  status: string;
  branch: string;
  log: string;
  userMessage?: string;
}

export function buildPrompt(context: CommitContext): string {
  return `## Conventional Commits

### Format

\`\`\`
<type>[optional scope]: <short description>

- explain the motivation behind this change
\`\`\`

### Type Choices

Use one of: fix, feat, build, chore, ci, docs, style, refactor, perf, test

- feat: adds a new feature
- fix: represents a bug fix
- BREAKING CHANGE: add ! before : in type/scope, or include BREAKING CHANGE: footer
  - signals when: removing/renaming public fields or functions, changing function signatures, removing supported values

### Guidelines

**description:**

- imperative, present tense, lowercase start, no period
- immediately follows the colon and space

**body** (include by default; omit only for trivial changes like typo fixes):

- blank line after description
- use dashes (-) for bullet points
- imperative, present tense, lowercase start, no period
- each line ≤ 80 characters
- explain the motivation (WHY), not just what changed

**footer (optional):**

- one blank line after body
- token format: Token: value or Token #value
- BREAKING CHANGE MUST be uppercase

### Examples

\`\`\`
fix(auth): add refresh token logic

- users were unexpectedly logged out when token expired silently
\`\`\`

\`\`\`
refactor(api)!: split User name into firstName and lastName

- downstream callers reading user.name will break; must migrate to firstName/lastName
\`\`\`

### Validation Checklist

- type is one of the allowed types
- scope (if used) is a noun in parentheses
- description is lowercase, imperative, no trailing period
- body begins with a blank line after description
- body uses - bullet points (never prose paragraphs)
- every line ≤ 80 characters
- breaking changes marked with ! or BREAKING CHANGE: footer

### Common Mistakes

| Mistake | Fix |
| feat: Added new button | feat: add new button (imperative, lowercase) |
| fix: fixed bug. | fix: fix bug (no period, imperative) |
| Body immediately after description | Add blank line between description and body |
| Line > 80 chars | Break into multiple lines |
| breaking change: in footer | Must be BREAKING CHANGE: (uppercase) |
| No body on non-trivial change | Add body explaining motivation (WHY) |
| Body written as prose paragraph | Use - bullet points instead |
| feat!(scope): ... — ! before scope | ! goes after scope: feat(scope)!: ... |
| feat!: ... — ! before colon, no scope | feat!: ... ✅ (no scope) |
| Renamed/removed public field with no ! | Add ! after type/scope: refactor(api)!: ... |
| Changed function signature with no ! | Add ! after type/scope: feat(auth)!: ... |

## Context

- Current git diff:
${context.diff}

- Current branch: ${context.branch}

- Recent commits:
${context.log}
${context.userMessage ? `\n- User instructions:\n${context.userMessage}\n` : ''}
## Your task

Generate a single git commit message for the above diff.
Follow the style of the recent commits.
If the recent commits don't follow a clear style, use the Conventional Commits format above.
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
