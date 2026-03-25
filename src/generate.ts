import type { CommitlintRules } from './commitlint';
import { LLMStrategy } from './strategies';

export interface CommitContext {
  diff: string;
  status: string;
  branch: string;
  log: string;
  userMessage?: string;
  commitlintRules?: CommitlintRules;
  subjectLength?: number;
  lineLength?: number;
}

const DEFAULT_TYPES = [
  'fix',
  'feat',
  'build',
  'chore',
  'ci',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
];

function commitlintSection(rules: CommitlintRules): string {
  const lines: string[] = [];

  if (rules.scopes) {
    lines.push(`- Allowed scopes: ${rules.scopes.join(', ')}`);
  }
  if (rules.headerMaxLength) {
    lines.push(
      `- Header (type + scope + description) ≤ ${rules.headerMaxLength} characters`,
    );
  }
  if (rules.bodyMaxLineLength) {
    lines.push(`- Body lines ≤ ${rules.bodyMaxLineLength} characters`);
  }
  if (rules.footerMaxLineLength) {
    lines.push(`- Footer lines ≤ ${rules.footerMaxLineLength} characters`);
  }
  if (rules.subjectCase) {
    const { condition, cases } = rules.subjectCase;
    if (condition === 'always') {
      lines.push(`- Description must be ${cases.join('/')} case`);
    } else {
      lines.push(`- Description must not be ${cases.join('/')} case`);
    }
  }
  if (rules.subjectFullStop) {
    const { condition, char } = rules.subjectFullStop;
    if (condition === 'never') {
      lines.push(`- Description must not end with "${char}"`);
    } else {
      lines.push(`- Description must end with "${char}"`);
    }
  }

  if (lines.length === 0) {
    return '';
  }
  return `\n### Project Rules (from commitlint config)\n\n${lines.join('\n')}\n`;
}

export function buildPrompt(context: CommitContext): string {
  const rules = context.commitlintRules;
  const types = rules?.types ?? DEFAULT_TYPES;
  const projectRules = rules ? commitlintSection(rules) : '';

  const headerMax = rules?.headerMaxLength ?? context.subjectLength;
  const bodyMax = rules?.bodyMaxLineLength ?? context.lineLength;
  const lengthRules =
    (headerMax ? `\n- Subject line ≤ ${headerMax} characters` : '') +
    (bodyMax ? `\n- Body lines ≤ ${bodyMax} characters` : '');

  return `## Conventional Commits

### Format

\`\`\`
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
\`\`\`

### Types

Use one of: ${types.join(', ')}

- feat: a new feature
- fix: a bug fix
- BREAKING CHANGE: append ! after type/scope, or add a BREAKING CHANGE: footer

### Rules

- Separate description from body with a blank line
- Footer uses git trailer format: \`Token: value\` or \`Token #value\`
- BREAKING CHANGE footer must be uppercase${lengthRules}

### Examples

\`\`\`
feat(lang): add Polish language
\`\`\`

\`\`\`
fix: prevent racing of requests

- introduce a request id and reference to latest request
- dismiss incoming responses other than from latest request
\`\`\`

\`\`\`
feat(api)!: send an email to the customer when a product is shipped

BREAKING CHANGE: \`]notify\` method signature changed
\`\`\`
${projectRules}
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
