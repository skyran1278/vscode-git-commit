import { spawn } from 'child_process';

type SpawnFn = (
  cmd: string,
  args: string[],
  opts: { stdio: ['pipe', 'pipe', 'pipe'] },
) => ReturnType<typeof spawn>;

export interface LLMStrategy {
  sendRequest(prompt: string): Promise<string>;
}

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

export interface CommitContext {
  diff: string;
  status: string;
  branch: string;
  log: string;
  userMessage?: string;
}

export function buildPrompt(context: CommitContext): string {
  return `## Context

- Current git status:
${context.status}

- Current git diff (staged and unstaged changes):
${context.diff}

- Current branch: ${context.branch}

- Recent commits:
${context.log}
${context.userMessage ? `\n- User instructions:\n${context.userMessage}` : ''}
## Your task

Based on the above changes and commit history style, generate a single commit message. Output only the commit message, no code fences.`;
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
