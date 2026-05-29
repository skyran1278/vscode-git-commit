import * as assert from 'assert';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Writable } from 'stream';

import {
  buildPrompt,
  generateCommitMessage,
  type CommitContext,
} from '../generate';
import { ClaudeCliStrategy, LLMStrategy } from '../strategies';

const DEFAULT_CONTEXT: CommitContext = {
  diff: 'diff content',
  status: 'M src/file.ts',
  branch: 'main',
  log: 'abc1234 initial commit',
};

type FakeSpawnOpts = {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  errorCode?: string;
};

function makeFakeSpawn(opts: FakeSpawnOpts) {
  return (_cmd: string, _args: string[], _options: unknown): ChildProcess => {
    const chunks: Buffer[] = [];
    const stdin = new Writable({
      write(chunk: Buffer, _enc: BufferEncoding, cb: () => void) {
        chunks.push(chunk);
        cb();
      },
    });
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const proc = new EventEmitter() as ChildProcess;
    (proc as any).stdin = stdin;
    (proc as any).stdout = stdout;
    (proc as any).stderr = stderr;
    (proc as any)._stdinChunks = chunks;

    process.nextTick(() => {
      if (opts.errorCode) {
        const err: NodeJS.ErrnoException = new Error('spawn error');
        err.code = opts.errorCode;
        proc.emit('error', err);
        return;
      }
      if (opts.stdout) {
        stdout.emit('data', Buffer.from(opts.stdout));
      }
      if (opts.stderr) {
        stderr.emit('data', Buffer.from(opts.stderr));
      }
      proc.emit('close', opts.exitCode ?? 0);
    });

    return proc;
  };
}

suite('generateCommitMessage', () => {
  function makeStrategy(
    sendRequest: (p: string) => Promise<string>,
  ): LLMStrategy {
    return { sendRequest };
  }

  test('resolves with trimmed response on success', async () => {
    const result = await generateCommitMessage(
      DEFAULT_CONTEXT,
      makeStrategy(async () => '  feat: add login\n'),
    );
    assert.strictEqual(result, 'feat: add login');
  });

  test('propagates errors thrown by strategy', async () => {
    await assert.rejects(
      () =>
        generateCommitMessage(
          DEFAULT_CONTEXT,
          makeStrategy(async () => {
            throw new Error('API error');
          }),
        ),
      /API error/,
    );
  });

  test('throws "empty response" when response trims to empty', async () => {
    await assert.rejects(
      () =>
        generateCommitMessage(
          DEFAULT_CONTEXT,
          makeStrategy(async () => '   \n'),
        ),
      /empty response/,
    );
  });

  test('sends diff in prompt', async () => {
    let capturedPrompt = '';
    await generateCommitMessage(
      { ...DEFAULT_CONTEXT, diff: 'my special diff' },
      makeStrategy(async (p) => {
        capturedPrompt = p;
        return 'feat: x';
      }),
    );
    assert.ok(capturedPrompt.includes('my special diff'));
  });

  test('includes userMessage in prompt when provided', async () => {
    let capturedPrompt = '';
    await generateCommitMessage(
      { ...DEFAULT_CONTEXT, userMessage: 'focus on the auth changes' },
      makeStrategy(async (p) => {
        capturedPrompt = p;
        return 'feat: x';
      }),
    );
    assert.ok(capturedPrompt.includes('- User instructions:'));
    assert.ok(capturedPrompt.includes('focus on the auth changes'));
  });

  test('omits user instructions section when no userMessage', async () => {
    let capturedPrompt = '';
    await generateCommitMessage(
      DEFAULT_CONTEXT,
      makeStrategy(async (p) => {
        capturedPrompt = p;
        return 'feat: x';
      }),
    );
    assert.ok(!capturedPrompt.includes('- User instructions:'));
  });
});

type ValidatorResult = { valid: boolean; problems: string[] };

function makeValidator(sequence: ValidatorResult[]) {
  let i = 0;
  const calls: string[] = [];
  const fn = async (message: string): Promise<ValidatorResult> => {
    calls.push(message);
    return sequence[Math.min(i++, sequence.length - 1)];
  };
  return Object.assign(fn, { calls });
}

function makeSequentialStrategy(responses: string[]): {
  strategy: LLMStrategy;
  prompts: string[];
} {
  const prompts: string[] = [];
  let i = 0;
  const strategy: LLMStrategy = {
    sendRequest: async (p: string) => {
      prompts.push(p);
      return responses[Math.min(i++, responses.length - 1)];
    },
  };
  return { strategy, prompts };
}

suite('generateCommitMessage validation + retry', () => {
  test('returns first message without retry when it is valid', async () => {
    const validator = makeValidator([{ valid: true, problems: [] }]);
    const { strategy, prompts } = makeSequentialStrategy(['feat: valid one']);
    const result = await generateCommitMessage(DEFAULT_CONTEXT, strategy, {
      validate: validator,
    });
    assert.strictEqual(result, 'feat: valid one');
    assert.strictEqual(prompts.length, 1, 'should not retry');
    assert.strictEqual(validator.calls.length, 1);
  });

  test('retries once with violations fed back, returns the fixed message', async () => {
    const validator = makeValidator([
      {
        valid: false,
        problems: ['header must not be longer than 50 characters'],
      },
      { valid: true, problems: [] },
    ]);
    const { strategy, prompts } = makeSequentialStrategy([
      'feat: a header that is far too long to be acceptable here',
      'feat: short header',
    ]);
    const result = await generateCommitMessage(DEFAULT_CONTEXT, strategy, {
      validate: validator,
    });
    assert.strictEqual(result, 'feat: short header');
    assert.strictEqual(prompts.length, 2, 'should retry exactly once');
    assert.ok(
      prompts[1].includes('header must not be longer than 50 characters'),
      'retry prompt must include the violation feedback',
    );
  });

  test('after retries exhausted returns best attempt and warns', async () => {
    const validator = makeValidator([
      { valid: false, problems: ['p1', 'p2'] },
      { valid: false, problems: ['p1'] },
    ]);
    const { strategy } = makeSequentialStrategy(['msg one', 'msg two']);
    const warnings: string[][] = [];
    const result = await generateCommitMessage(DEFAULT_CONTEXT, strategy, {
      validate: validator,
      onWarnings: (w) => warnings.push(w),
    });
    assert.strictEqual(
      result,
      'msg two',
      'returns the attempt with fewer problems',
    );
    assert.deepStrictEqual(warnings, [['p1']]);
  });

  test('keeps the earlier attempt on a tie in problem count', async () => {
    const validator = makeValidator([
      { valid: false, problems: ['p1'] },
      { valid: false, problems: ['p2'] },
    ]);
    const { strategy } = makeSequentialStrategy(['first', 'second']);
    const result = await generateCommitMessage(DEFAULT_CONTEXT, strategy, {
      validate: validator,
    });
    assert.strictEqual(result, 'first');
  });

  test('returns the first attempt when a retry yields an empty response', async () => {
    const validator = makeValidator([{ valid: false, problems: ['p1'] }]);
    const { strategy } = makeSequentialStrategy([
      'feat: usable first attempt',
      '',
    ]);
    const warnings: string[][] = [];
    const result = await generateCommitMessage(DEFAULT_CONTEXT, strategy, {
      validate: validator,
      onWarnings: (w) => warnings.push(w),
    });
    assert.strictEqual(
      result,
      'feat: usable first attempt',
      'a flaky empty retry must not discard the usable first attempt',
    );
    assert.deepStrictEqual(warnings, [['p1']]);
  });

  test('without a validator behaves as before (no validation, no retry)', async () => {
    const { strategy, prompts } = makeSequentialStrategy(['feat: x']);
    const result = await generateCommitMessage(DEFAULT_CONTEXT, strategy);
    assert.strictEqual(result, 'feat: x');
    assert.strictEqual(prompts.length, 1);
  });
});

suite('buildPrompt violations feedback', () => {
  test('includes the violations section when violations present', () => {
    const prompt = buildPrompt({
      ...DEFAULT_CONTEXT,
      violations: ['header must not be longer than 50 characters'],
    });
    assert.ok(prompt.includes('previous attempt'));
    assert.ok(prompt.includes('header must not be longer than 50 characters'));
  });

  test('omits the violations section when none present', () => {
    const prompt = buildPrompt(DEFAULT_CONTEXT);
    assert.ok(!prompt.includes('previous attempt'));
  });
});

suite('buildPrompt unified format', () => {
  test('always includes Conventional Commits heading', () => {
    const prompt = buildPrompt(DEFAULT_CONTEXT);
    assert.ok(prompt.includes('## Conventional Commits'));
  });

  test('includes Conventional Commits heading with commitlint rules', () => {
    const prompt = buildPrompt({
      ...DEFAULT_CONTEXT,
      commitlintRules: { types: ['feat', 'fix'] },
    });
    assert.ok(prompt.includes('## Conventional Commits'));
  });

  test('task instruction references Conventional Commits format', () => {
    const prompt = buildPrompt(DEFAULT_CONTEXT);
    assert.ok(prompt.includes('following the Conventional Commits format'));
  });

  test('recent commits used for tone only', () => {
    const prompt = buildPrompt(DEFAULT_CONTEXT);
    assert.ok(prompt.includes('only as reference for tone and wording style'));
  });
});

suite('buildPrompt with commitlintRules', () => {
  test('uses custom types from commitlint rules', () => {
    const prompt = buildPrompt({
      ...DEFAULT_CONTEXT,
      commitlintRules: { types: ['feat', 'fix', 'chore'] },
    });
    assert.ok(prompt.includes('Use one of: feat, fix, chore'));
    assert.ok(!prompt.includes('build, chore, ci, docs'));
  });

  test('includes scopes when provided', () => {
    const prompt = buildPrompt({
      ...DEFAULT_CONTEXT,
      commitlintRules: { scopes: ['core', 'ui'] },
    });
    assert.ok(prompt.includes('Allowed scopes: core, ui'));
  });

  test('uses custom header max length', () => {
    const prompt = buildPrompt({
      ...DEFAULT_CONTEXT,
      commitlintRules: { headerMaxLength: 72 },
    });
    assert.ok(prompt.includes('≤ 72 characters'));
  });

  test('uses custom body max line length', () => {
    const prompt = buildPrompt({
      ...DEFAULT_CONTEXT,
      commitlintRules: { bodyMaxLineLength: 100 },
    });
    assert.ok(prompt.includes('≤ 100 characters'));
  });

  test('uses default types when no commitlint rules', () => {
    const prompt = buildPrompt(DEFAULT_CONTEXT);
    assert.ok(
      prompt.includes(
        'Use one of: fix, feat, build, chore, ci, docs, style, refactor, perf, test, revert',
      ),
    );
  });

  test('adapts subject case guidance', () => {
    const prompt = buildPrompt({
      ...DEFAULT_CONTEXT,
      commitlintRules: {
        subjectCase: { condition: 'always', cases: ['lower-case'] },
      },
    });
    assert.ok(prompt.includes('must be lower-case case'));
  });

  test('adapts subject full stop guidance', () => {
    const prompt = buildPrompt({
      ...DEFAULT_CONTEXT,
      commitlintRules: {
        subjectFullStop: { condition: 'never', char: '.' },
      },
    });
    assert.ok(prompt.includes('must not end with "."'));
  });

  test('commitlint headerMaxLength overrides subjectLength', () => {
    const prompt = buildPrompt({
      ...DEFAULT_CONTEXT,
      subjectLength: 50,
      commitlintRules: { headerMaxLength: 100 },
    });
    assert.ok(prompt.includes('≤ 100 characters'));
    assert.ok(!prompt.includes('≤ 50 characters'));
  });

  test('commitlint bodyMaxLineLength overrides lineLength', () => {
    const prompt = buildPrompt({
      ...DEFAULT_CONTEXT,
      lineLength: 72,
      commitlintRules: { bodyMaxLineLength: 120 },
    });
    assert.ok(prompt.includes('≤ 120 characters'));
    assert.ok(!prompt.includes('≤ 72 characters'));
  });
});

suite('buildPrompt with VSCode git settings', () => {
  test('includes subjectLength in prompt', () => {
    const prompt = buildPrompt({
      ...DEFAULT_CONTEXT,
      subjectLength: 50,
    });
    assert.ok(
      prompt.includes('Header (type + scope + description) ≤ 50 characters'),
    );
  });

  test('includes lineLength in prompt', () => {
    const prompt = buildPrompt({
      ...DEFAULT_CONTEXT,
      lineLength: 72,
    });
    assert.ok(prompt.includes('Body lines ≤ 72 characters'));
  });

  test('no length rules when neither set', () => {
    const prompt = buildPrompt(DEFAULT_CONTEXT);
    assert.ok(!prompt.includes('Subject line'));
    assert.ok(!prompt.includes('Body lines'));
  });
  test('no project rules section without commitlint config', () => {
    const prompt = buildPrompt(DEFAULT_CONTEXT);
    assert.ok(!prompt.includes('Project Commit Rules'));
  });
  test('always enforces format and rules', () => {
    const prompt = buildPrompt({
      ...DEFAULT_CONTEXT,
      subjectLength: 50,
    });
    assert.ok(prompt.includes('MUST follow the format and rules above'));
  });
  test('enforces format even without length rules', () => {
    const prompt = buildPrompt(DEFAULT_CONTEXT);
    assert.ok(prompt.includes('MUST follow the format and rules above'));
  });
});

suite('ClaudeCliStrategy', () => {
  test('resolves with trimmed stdout on success', async () => {
    const strategy = new ClaudeCliStrategy(
      undefined,
      makeFakeSpawn({ stdout: '  feat: add login\n', exitCode: 0 }) as any,
    );
    const result = await strategy.sendRequest('prompt');
    assert.strictEqual(result, 'feat: add login');
  });

  test('throws "Claude CLI not found" on ENOENT', async () => {
    const strategy = new ClaudeCliStrategy(
      undefined,
      makeFakeSpawn({ errorCode: 'ENOENT' }) as any,
    );
    await assert.rejects(
      () => strategy.sendRequest('prompt'),
      (err: Error) => {
        assert.ok(err.message.includes('Claude CLI not found'));
        assert.ok(
          err.message.includes('npm install -g @anthropic-ai/claude-code'),
        );
        return true;
      },
    );
  });

  test('throws "Claude CLI failed" on non-ENOENT spawn error', async () => {
    const strategy = new ClaudeCliStrategy(
      undefined,
      makeFakeSpawn({ errorCode: 'EACCES' }) as any,
    );
    await assert.rejects(
      () => strategy.sendRequest('prompt'),
      /Claude CLI failed/,
    );
  });

  test('throws with exit code and stderr on non-zero exit', async () => {
    const strategy = new ClaudeCliStrategy(
      undefined,
      makeFakeSpawn({ exitCode: 1, stderr: 'rate limit exceeded' }) as any,
    );
    await assert.rejects(
      () => strategy.sendRequest('prompt'),
      (err: Error) => {
        assert.ok(err.message.includes('exited with code 1'));
        assert.ok(err.message.includes('rate limit exceeded'));
        return true;
      },
    );
  });

  test('writes prompt to stdin', async () => {
    let capturedProc: any;
    const inner = makeFakeSpawn({ stdout: 'feat: x', exitCode: 0 });
    const fakeSpawn = (...args: Parameters<typeof inner>) => {
      capturedProc = inner(...args);
      return capturedProc;
    };
    const strategy = new ClaudeCliStrategy(undefined, fakeSpawn as any);
    await strategy.sendRequest('my special prompt');
    const written = Buffer.concat(capturedProc._stdinChunks).toString();
    assert.ok(written.includes('my special prompt'));
  });
});
