import * as vscode from 'vscode';

import { loadCommitlintRules } from './commitlint';
import { generateCommitMessage } from './generate';
import { getGitContext } from './git';
import {
  ClaudeCliStrategy,
  LLMStrategy,
  PerplexityStrategy,
  VscodeLmStrategy,
} from './strategies';

interface Repository {
  rootUri: vscode.Uri;
  inputBox: { value: string };
  diff(staged: boolean): Promise<string>;
}

interface GitAPI {
  repositories: Repository[];
  getRepository(uri: vscode.Uri): Repository | null;
}

async function promptForApiKey(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  const key = await vscode.window.showInputBox({
    prompt: 'Enter your Perplexity API key',
    password: true,
    ignoreFocusOut: true,
  });
  if (key !== undefined) {
    await context.secrets.store('perplexity-api-key', key);
    vscode.window.showInformationMessage('Perplexity API key saved.');
  }
  return key || undefined;
}

async function createStrategy(
  token: vscode.CancellationToken,
  context: vscode.ExtensionContext,
): Promise<LLMStrategy | null> {
  const cfg = vscode.workspace.getConfiguration('ranCommit');
  const method = cfg.get<string>('method', 'auto');
  const family = cfg.get<string>('modelFamily', '');
  const vendor = cfg.get<string>('modelVendor', '');
  const selector = {
    ...(vendor ? { vendor } : {}),
    ...(family ? { family } : {}),
  };

  if (method === 'claude-cli') {
    return new ClaudeCliStrategy(family || undefined);
  }

  if (method === 'perplexity') {
    let apiKey = await context.secrets.get('perplexity-api-key');
    if (!apiKey) {
      apiKey = await promptForApiKey(context);
      if (!apiKey) {
        return null;
      }
    }
    const model =
      vendor && family ? `${vendor}/${family}` : family || undefined;
    return new PerplexityStrategy(apiKey, model);
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
  return new ClaudeCliStrategy(family || undefined);
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ranCommit.storePerplexityApiKey', () =>
      promptForApiKey(context),
    ),
  );

  const disposable = vscode.commands.registerCommand(
    'ranCommit.generateCommit',
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
      const repoRoot = repo.rootUri.fsPath;
      const [gitContext, commitlintRules] = await Promise.all([
        getGitContext(repo, userMessage || undefined),
        loadCommitlintRules(repoRoot),
      ]);
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
          const strategy = await createStrategy(token, context);
          if (!strategy) {
            return;
          }

          try {
            const gitCfg = vscode.workspace.getConfiguration('git');
            gitContext.subjectLength = gitCfg.get<number>(
              'inputValidationSubjectLength',
              50,
            );
            gitContext.lineLength = gitCfg.get<number>(
              'inputValidationLength',
              72,
            );
            if (commitlintRules) {
              gitContext.commitlintRules = commitlintRules;
            }
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
