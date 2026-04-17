import * as vscode from 'vscode';

import { loadCommitlintRules } from './commitlint';
import { buildPrompt, generateCommitMessage } from './generate';
import { getGitContext } from './git';
import { selectModel } from './models';
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

function parseVscodeLmSelector(model: string): {
  vendor?: string;
  family?: string;
} {
  if (!model) {
    return {};
  }
  const idx = model.indexOf('/');
  if (idx === -1) {
    return { family: model };
  }
  const vendor = model.slice(0, idx) || undefined;
  const family = model.slice(idx + 1) || undefined;
  return { ...(vendor ? { vendor } : {}), ...(family ? { family } : {}) };
}

async function createStrategy(
  token: vscode.CancellationToken,
  context: vscode.ExtensionContext,
): Promise<LLMStrategy | null> {
  const cfg = vscode.workspace.getConfiguration('ranCommit');
  const method = cfg.get<string>('method', 'auto');

  if (method === 'claude-cli') {
    const model = cfg.get<string>('claudeCliModel', '') || undefined;
    return new ClaudeCliStrategy(model);
  }

  if (method === 'perplexity') {
    let apiKey = await context.secrets.get('perplexity-api-key');
    if (!apiKey) {
      apiKey = await promptForApiKey(context);
      if (!apiKey) {
        return null;
      }
    }
    const model = cfg.get<string>('perplexityModel', '') || undefined;
    return new PerplexityStrategy(apiKey, model);
  }

  const selector = parseVscodeLmSelector(cfg.get<string>('vscodeLmModel', ''));

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
  const cliModel = cfg.get<string>('claudeCliModel', '') || undefined;
  return new ClaudeCliStrategy(cliModel);
}

const outputChannel = vscode.window.createOutputChannel('Ran Commit', {
  log: true,
});

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(outputChannel);
  context.subscriptions.push(
    vscode.commands.registerCommand('ranCommit.storePerplexityApiKey', () =>
      promptForApiKey(context),
    ),
    vscode.commands.registerCommand('ranCommit.selectModel', selectModel),
  );

  const disposable = vscode.commands.registerCommand(
    'ranCommit.generateCommit',
    async (scm?: vscode.SourceControl) => {
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
        (scm?.rootUri && api.getRepository(scm.rootUri)) ??
        (activeEditor && api.getRepository(activeEditor.document.uri)) ??
        (api.repositories.length === 1 ? api.repositories[0] : null);
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
            outputChannel.debug(buildPrompt(gitContext));
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
