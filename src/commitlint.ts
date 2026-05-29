import { execFile } from 'child_process';

export interface CommitlintRules {
  types?: string[];
  scopes?: string[];
  headerMaxLength?: number;
  bodyMaxLineLength?: number;
  footerMaxLineLength?: number;
  subjectCase?: { condition: 'always' | 'never'; cases: string[] };
  subjectFullStop?: { condition: 'always' | 'never'; char: string };
}

type RawRule = [number, 'always' | 'never', unknown];

function extractRule(
  rules: Record<string, RawRule>,
  name: string,
): RawRule | undefined {
  const rule = rules[name];
  if (!rule || rule[0] === 0) {
    return undefined;
  }
  return rule;
}

export function parseRules(
  raw: Record<string, RawRule>,
): CommitlintRules | undefined {
  const rules: CommitlintRules = {};
  let hasRules = false;

  const typeEnum = extractRule(raw, 'type-enum');
  if (typeEnum && Array.isArray(typeEnum[2]) && typeEnum[1] === 'always') {
    rules.types = typeEnum[2] as string[];
    hasRules = true;
  }

  const scopeEnum = extractRule(raw, 'scope-enum');
  if (scopeEnum && Array.isArray(scopeEnum[2]) && scopeEnum[1] === 'always') {
    rules.scopes = scopeEnum[2] as string[];
    hasRules = true;
  }

  const headerMax = extractRule(raw, 'header-max-length');
  if (headerMax && typeof headerMax[2] === 'number') {
    rules.headerMaxLength = headerMax[2];
    hasRules = true;
  }

  const bodyMax = extractRule(raw, 'body-max-line-length');
  if (bodyMax && typeof bodyMax[2] === 'number') {
    rules.bodyMaxLineLength = bodyMax[2];
    hasRules = true;
  }

  const footerMax = extractRule(raw, 'footer-max-line-length');
  if (footerMax && typeof footerMax[2] === 'number') {
    rules.footerMaxLineLength = footerMax[2];
    hasRules = true;
  }

  const subjectCase = extractRule(raw, 'subject-case');
  if (subjectCase) {
    const cases = Array.isArray(subjectCase[2])
      ? (subjectCase[2] as string[])
      : typeof subjectCase[2] === 'string'
        ? [subjectCase[2]]
        : undefined;
    if (cases) {
      rules.subjectCase = { condition: subjectCase[1], cases };
      hasRules = true;
    }
  }

  const subjectFullStop = extractRule(raw, 'subject-full-stop');
  if (subjectFullStop && typeof subjectFullStop[2] === 'string') {
    rules.subjectFullStop = {
      condition: subjectFullStop[1],
      char: subjectFullStop[2],
    };
    hasRules = true;
  }

  return hasRules ? rules : undefined;
}

const LOAD_SCRIPT = `
import('@commitlint/load')
  .then(m => (m.default || m)({ cwd: process.cwd() }))
  .then(c => process.stdout.write(JSON.stringify(c.rules)))
  .catch(() => process.exit(1));
`;

export interface LoadedCommitlint {
  /** The full effective commitlint rules, fed to `@commitlint/lint`. */
  raw: Record<string, RawRule>;
  /** The readable subset used to describe rules in the prompt. */
  parsed?: CommitlintRules;
}

export function loadCommitlintRules(
  repoRoot: string,
): Promise<LoadedCommitlint | undefined> {
  return new Promise((resolve) => {
    execFile(
      'node',
      ['--input-type=module', '-e', LOAD_SCRIPT],
      { cwd: repoRoot, timeout: 10_000 },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(undefined);
          return;
        }
        try {
          const raw = JSON.parse(stdout.trim()) as Record<string, RawRule>;
          if (Object.keys(raw).length === 0) {
            resolve(undefined);
            return;
          }
          resolve({ raw, parsed: parseRules(raw) });
        } catch {
          resolve(undefined);
        }
      },
    );
  });
}
