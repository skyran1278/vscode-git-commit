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
  /** Problems from a previous attempt, fed back so the model can fix them. */
  violations?: string[];
}

export interface GenerateOptions {
  /** Validates a message; absent means no validation and no retry. */
  validate?: (
    message: string,
  ) => Promise<{ valid: boolean; problems: string[] }>;
  /** Max number of retries after the first attempt (default 1). */
  maxRetries?: number;
  /** Called with remaining problems when the final message is still invalid. */
  onWarnings?: (warnings: string[]) => void;
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
  'revert',
];

function commitlintRulesLines(
  rules: CommitlintRules,
  subjectLength?: number,
  lineLength?: number,
): string[] {
  const lines: string[] = [];

  if (rules.scopes) {
    lines.push(`- Allowed scopes: ${rules.scopes.join(', ')}`);
  }

  const headerMax = rules.headerMaxLength ?? subjectLength;
  if (headerMax) {
    lines.push(
      `- Header (type + scope + description) ≤ ${headerMax} characters`,
    );
  }

  const bodyMax = rules.bodyMaxLineLength ?? lineLength;
  if (bodyMax) {
    lines.push(`- Body lines ≤ ${bodyMax} characters`);
  }
  if (rules.footerMaxLineLength) {
    lines.push(`- Footer lines ≤ ${rules.footerMaxLineLength} characters`);
  }
  if (rules.subjectCase) {
    const { condition, cases } = rules.subjectCase;
    if (condition === 'always') {
      lines.push(`- Description must be ${cases.join('/')}`);
    } else {
      lines.push(`- Description must not be ${cases.join('/')}`);
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

  return lines;
}

export function buildPrompt(context: CommitContext): string {
  const types = context.commitlintRules?.types ?? DEFAULT_TYPES;

  const ruleLines: string[] = [
    '- Separate description from body with a blank line',
    '- Footer uses git trailer format: `Token: value` or `Token #value`',
    '- BREAKING CHANGE footer must be uppercase',
  ];

  ruleLines.push(
    ...commitlintRulesLines(
      context.commitlintRules ?? {},
      context.subjectLength,
      context.lineLength,
    ),
  );

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

${ruleLines.join('\n')}

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

BREAKING CHANGE: \`notify\` method signature changed
\`\`\`

## Context

- Current git diff:
${context.diff}

- Current branch: ${context.branch}

- Recent commits:
${context.log}
${context.userMessage ? `\n- User instructions:\n${context.userMessage}\n` : ''}${
    context.violations?.length
      ? `\n## Fix these issues from your previous attempt\n\n${context.violations
          .map((v) => `- ${v}`)
          .join('\n')}\n`
      : ''
  }
## Your task

Generate a single git commit message following the Conventional Commits format above.
Use the recent commits only as reference for tone and wording style.
You MUST follow the format and rules above.
Output only the commit message with no code fences, quotes, or explanation.`;
}

export async function generateCommitMessage(
  context: CommitContext,
  strategy: LLMStrategy,
  options: GenerateOptions = {},
): Promise<string> {
  const { validate, maxRetries = 1, onWarnings } = options;

  const generate = async (ctx: CommitContext): Promise<string> => {
    const message = (await strategy.sendRequest(buildPrompt(ctx))).trim();
    if (!message) {
      throw new Error('Language model returned an empty response');
    }
    return message;
  };

  const message = await generate(context);
  if (!validate) {
    return message;
  }

  let result = await validate(message);
  const best = { message, problems: result.problems };

  for (let i = 0; i < maxRetries && !result.valid; i++) {
    try {
      const retried = await generate({
        ...context,
        violations: result.problems,
      });
      result = await validate(retried);
      if (result.problems.length < best.problems.length) {
        best.message = retried;
        best.problems = result.problems;
      }
    } catch {
      // A retry can fail transiently (e.g. an empty model response). Keep the
      // best attempt so far rather than failing the whole command.
      break;
    }
  }

  if (best.problems.length > 0) {
    onWarnings?.(best.problems);
  }
  return best.message;
}
