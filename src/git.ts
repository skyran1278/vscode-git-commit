import { execFile } from 'child_process';

import type { CommitContext } from './generate';

function execGit(repoPath: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: repoPath }, (err, stdout) => {
      if (err) {
        resolve('');
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

interface Repository {
  rootUri: { fsPath: string };
  inputBox: { value: string };
  diff(staged: boolean): Promise<string>;
}

export async function getGitContext(
  repo: Repository,
  userMessage?: string,
): Promise<CommitContext | null> {
  const repoPath = repo.rootUri.fsPath;
  const [staged, unstaged, status, branch, log] = await Promise.all([
    repo.diff(true),
    repo.diff(false),
    execGit(repoPath, ['status']),
    execGit(repoPath, ['branch', '--show-current']),
    execGit(repoPath, ['log', '-10']),
  ]);
  const diff = staged || unstaged;
  if (!diff) {
    return null;
  }
  return { diff, status, branch, log, ...(userMessage && { userMessage }) };
}
