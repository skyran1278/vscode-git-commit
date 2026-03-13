import { spawn } from 'child_process';

import { LLMStrategy } from './index';

type SpawnFn = (
  cmd: string,
  args: string[],
  opts: { stdio: ['pipe', 'pipe', 'pipe'] },
) => ReturnType<typeof spawn>;

export class ClaudeCliStrategy implements LLMStrategy {
  constructor(private readonly spawnFn: SpawnFn = spawn as SpawnFn) {}

  sendRequest(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = this.spawnFn(
        'claude',
        ['--print', '--output-format', 'text'],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      child.stdout!.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr!.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      child.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          reject(
            new Error(
              'Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code',
            ),
          );
        } else {
          reject(new Error(`Claude CLI failed: ${err.message}`));
        }
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `Claude CLI exited with code ${code}: ${Buffer.concat(stderrChunks).toString()}`,
            ),
          );
        } else {
          resolve(Buffer.concat(stdoutChunks).toString().trim());
        }
      });

      child.stdin!.write(prompt);
      child.stdin!.end();
    });
  }
}
