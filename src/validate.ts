type RawRules = Record<string, unknown>;

interface LintOutcome {
  valid: boolean;
  errors: { message: string }[];
  warnings: { message: string }[];
}

export interface ValidationResult {
  valid: boolean;
  problems: string[];
}

export interface ResolveRulesOptions {
  /** Raw commitlint rules loaded from the repo's config, when present. */
  rawRules?: RawRules;
  /** VSCode `git.inputValidationSubjectLength`, used only without repo config. */
  subjectLength?: number;
  /** VSCode `git.inputValidationLength`, used only without repo config. */
  lineLength?: number;
}

/**
 * Resolve the rule set to lint a generated message against.
 *
 * When the repo has a commitlint config its raw rules win outright (mirroring
 * how the prompt prefers commitlint over VSCode settings). Otherwise we fall
 * back to bundled `@commitlint/config-conventional`, overriding the header and
 * body length limits with the editor's git settings when provided.
 */
export async function resolveRules(
  opts: ResolveRulesOptions,
): Promise<RawRules> {
  if (opts.rawRules) {
    return opts.rawRules;
  }

  const mod = (await import('@commitlint/config-conventional')) as unknown as {
    default?: { rules?: RawRules };
    rules?: RawRules;
  };
  const base = (mod.default ?? mod).rules ?? {};
  const rules: RawRules = { ...base };

  if (opts.subjectLength) {
    rules['header-max-length'] = [2, 'always', opts.subjectLength];
  }
  if (opts.lineLength) {
    rules['body-max-line-length'] = [2, 'always', opts.lineLength];
  }
  return rules;
}

/**
 * Lint a commit message in-process via the bundled `@commitlint/lint`.
 * Returns the human-readable error messages so callers can both feed them back
 * to the model and surface them to the user.
 */
export async function validateMessage(
  message: string,
  rules: RawRules,
): Promise<ValidationResult> {
  const mod = (await import('@commitlint/lint')) as unknown as {
    default: (message: string, rules: RawRules) => Promise<LintOutcome>;
  };
  const lint = mod.default;
  const outcome = await lint(message, rules);
  return {
    valid: outcome.valid,
    problems: outcome.errors.map((e) => e.message),
  };
}
