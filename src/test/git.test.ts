import * as assert from 'assert';

import { _impl, getGitContext } from '../git';

type FakeExecFileCallback = (
  err: Error | null,
  stdout: string,
  stderr: string,
) => void;

function makeFakeExecFile(results: Record<string, string>) {
  return (
    _cmd: string,
    args: string[],
    _options: unknown,
    callback: FakeExecFileCallback,
  ) => {
    const key = args.join(' ');
    const result = results[key];
    if (result === undefined) {
      callback(new Error(`unexpected git args: ${key}`), '', '');
    } else {
      callback(null, result, '');
    }
  };
}

const DEFAULT_EXEC_RESULTS = {
  status: 'On branch main\nnothing to commit',
  'branch --show-current': 'main',
  'log -10 --format=%B': 'abc1234 initial commit',
};

function makeRepo(staged: string, unstaged = '') {
  return {
    rootUri: { fsPath: '/repo' },
    inputBox: { value: '' },
    diff: async (s: boolean) => (s ? staged : unstaged),
  };
}

suite('getGitContext', () => {
  let originalExecFileFn: typeof _impl.execFileFn;

  setup(() => {
    originalExecFileFn = _impl.execFileFn;
    _impl.execFileFn = makeFakeExecFile(DEFAULT_EXEC_RESULTS) as any;
  });

  teardown(() => {
    _impl.execFileFn = originalExecFileFn;
  });

  test('returns null when both staged and unstaged diffs are empty', async () => {
    const result = await getGitContext(makeRepo('', ''));
    assert.strictEqual(result, null);
  });

  test('uses staged diff when available', async () => {
    const result = await getGitContext(
      makeRepo('staged diff', 'unstaged diff'),
    );
    assert.strictEqual(result?.diff, 'staged diff');
  });

  test('falls back to unstaged diff when staged is empty', async () => {
    const result = await getGitContext(makeRepo('', 'unstaged diff'));
    assert.strictEqual(result?.diff, 'unstaged diff');
  });

  test('includes userMessage when provided', async () => {
    const result = await getGitContext(makeRepo('diff'), 'focus on auth');
    assert.strictEqual(result?.userMessage, 'focus on auth');
  });

  test('omits userMessage when not provided', async () => {
    const result = await getGitContext(makeRepo('diff'));
    assert.ok(!('userMessage' in (result ?? {})));
  });

  test('passes correct args to git status, branch, and log', async () => {
    const seen: string[] = [];
    _impl.execFileFn = ((
      _cmd: string,
      args: string[],
      _opts: unknown,
      cb: FakeExecFileCallback,
    ) => {
      seen.push(args.join(' '));
      cb(null, 'output', '');
    }) as any;

    await getGitContext(makeRepo('diff'));
    assert.ok(seen.includes('status'));
    assert.ok(seen.includes('branch --show-current'));
    assert.ok(seen.includes('log -10 --format=%B'));
  });

  test('returns empty string from execGit on git error', async () => {
    _impl.execFileFn = ((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: FakeExecFileCallback,
    ) => {
      cb(new Error('git error'), '', '');
    }) as any;

    // Should not throw — errors in execGit resolve to ''
    const result = await getGitContext(makeRepo('diff'));
    assert.ok(result !== null);
    assert.strictEqual(result.status, '');
    assert.strictEqual(result.branch, '');
    assert.strictEqual(result.log, '');
  });
});
