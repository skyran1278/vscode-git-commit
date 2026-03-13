import * as vscode from 'vscode';

import { ClaudeCliStrategy, generateCommitMessage, LLMStrategy } from './generate';
import { getGitContext } from './git';

interface Repository {
  rootUri: vscode.Uri;
  inputBox: { value: string };
  diff(staged: boolean): Promise<string>;
}

interface GitAPI {
  repositories: Repository[];
  getRepository(uri: vscode.Uri): Repository | null;
}

class VscodeLmStrategy implements LLMStrategy {
  constructor(
    private readonly model: vscode.LanguageModelChat,
    private readonly token: vscode.CancellationToken,
  ) {}

  async sendRequest(prompt: string): Promise<string> {
    const response = await this.model.sendRequest(
      [vscode.LanguageModelChatMessage.User(prompt)],
      {},
      this.token,
    );
    let text = '';
    for await (const chunk of response.text) {
      text += chunk;
    }
    return text;
  }
}

async function createStrategy(
  token: vscode.CancellationToken,
): Promise<LLMStrategy | null> {
  const cfg = vscode.workspace.getConfiguration('git-commit');
  const method = cfg.get<string>('method', 'auto');
  const family = cfg.get<string>('modelFamily', '');
  const selector = family ? { family } : {};

  if (method === 'claude-cli') {
    return new ClaudeCliStrategy();
  }

  if (method === 'vscode-lm') {
    const models = await vscode.lm.selectChatModels(selector);
    if (!models[0]) {
      vscode.window.showErrorMessage(
        'No language model available. Install GitHub Copilot or configure a model provider.',
      );
      return null;
    }
    return new VscodeLmStrategy(models[0], token);
  }

  // auto: prefer vscode-lm, fall back to Claude CLI
  const models = await vscode.lm.selectChatModels(selector);
  if (models[0]) {
    return new VscodeLmStrategy(models[0], token);
  }
  return new ClaudeCliStrategy();
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'git-commit.generateCommit',
    async () => {
      const gitExt = vscode.extensions.getExtension<{
        getAPI(v: number): GitAPI;
      }>('vscode.git');
      if (!gitExt?.isActive) {
        vscode.window.showErrorMessage('Git extension not available');
        return;
      }

      const api = gitExt.exports.getAPI(1);
      const activeEditor = vscode.window.activeTextEditor;
      const repo =
        (activeEditor && api.getRepository(activeEditor.document.uri)) ??
        api.repositories[0];
      if (!repo) {
        vscode.window.showErrorMessage('No git repository found');
        return;
      }

      const userMessage = repo.inputBox.value.trim();
      const gitContext = await getGitContext(repo, userMessage || undefined);
      if (!gitContext) {
        vscode.window.showWarningMessage(
          'No changes found to generate a commit message from',
        );
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.SourceControl,
          title: 'Generating commit message...',
        },
        async (_, token) => {
          const strategy = await createStrategy(token);
          if (!strategy) { return; }

          try {
            const generated = await generateCommitMessage(gitContext, strategy);
            repo.inputBox.value = userMessage
              ? `${userMessage}\n\n${generated}`
              : generated;
          } catch (err: unknown) {
            vscode.window.showErrorMessage(
              `Failed to generate commit message: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      );
    },
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
