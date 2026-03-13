import * as assert from 'assert';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Writable } from 'stream';

import { generateCommitMessage } from '../generate';
import type { CommitContext } from '../generate';
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
      if (opts.stdout) { stdout.emit('data', Buffer.from(opts.stdout)); }
      if (opts.stderr) { stderr.emit('data', Buffer.from(opts.stderr)); }
      proc.emit('close', opts.exitCode ?? 0);
    });

    return proc;
  };
}

suite('generateCommitMessage', () => {
  function makeStrategy(sendRequest: (p: string) => Promise<string>): LLMStrategy {
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
      () => generateCommitMessage(DEFAULT_CONTEXT, makeStrategy(async () => { throw new Error('API error'); })),
      /API error/,
    );
  });

  test('throws "empty response" when response trims to empty', async () => {
    await assert.rejects(
      () => generateCommitMessage(DEFAULT_CONTEXT, makeStrategy(async () => '   \n')),
      /empty response/,
    );
  });

  test('sends diff in prompt', async () => {
    let capturedPrompt = '';
    await generateCommitMessage(
      { ...DEFAULT_CONTEXT, diff: 'my special diff' },
      makeStrategy(async (p) => { capturedPrompt = p; return 'feat: x'; }),
    );
    assert.ok(capturedPrompt.includes('my special diff'));
  });

  test('includes userMessage in prompt when provided', async () => {
    let capturedPrompt = '';
    await generateCommitMessage(
      { ...DEFAULT_CONTEXT, userMessage: 'focus on the auth changes' },
      makeStrategy(async (p) => { capturedPrompt = p; return 'feat: x'; }),
    );
    assert.ok(capturedPrompt.includes('- User instructions:'));
    assert.ok(capturedPrompt.includes('focus on the auth changes'));
  });

  test('omits user instructions section when no userMessage', async () => {
    let capturedPrompt = '';
    await generateCommitMessage(
      DEFAULT_CONTEXT,
      makeStrategy(async (p) => { capturedPrompt = p; return 'feat: x'; }),
    );
    assert.ok(!capturedPrompt.includes('- User instructions:'));
  });
});

suite('ClaudeCliStrategy', () => {
  test('resolves with trimmed stdout on success', async () => {
    const strategy = new ClaudeCliStrategy(makeFakeSpawn({ stdout: '  feat: add login\n', exitCode: 0 }) as any);
    const result = await strategy.sendRequest('prompt');
    assert.strictEqual(result, 'feat: add login');
  });

  test('throws "Claude CLI not found" on ENOENT', async () => {
    const strategy = new ClaudeCliStrategy(makeFakeSpawn({ errorCode: 'ENOENT' }) as any);
    await assert.rejects(
      () => strategy.sendRequest('prompt'),
      (err: Error) => {
        assert.ok(err.message.includes('Claude CLI not found'));
        assert.ok(err.message.includes('npm install -g @anthropic-ai/claude-code'));
        return true;
      },
    );
  });

  test('throws "Claude CLI failed" on non-ENOENT spawn error', async () => {
    const strategy = new ClaudeCliStrategy(makeFakeSpawn({ errorCode: 'EACCES' }) as any);
    await assert.rejects(
      () => strategy.sendRequest('prompt'),
      /Claude CLI failed/,
    );
  });

  test('throws with exit code and stderr on non-zero exit', async () => {
    const strategy = new ClaudeCliStrategy(makeFakeSpawn({ exitCode: 1, stderr: 'rate limit exceeded' }) as any);
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
    const strategy = new ClaudeCliStrategy(fakeSpawn as any);
    await strategy.sendRequest('my special prompt');
    const written = Buffer.concat(capturedProc._stdinChunks).toString();
    assert.ok(written.includes('my special prompt'));
  });
});
