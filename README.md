# Git Commit

AI-powered git commit message generator for VS Code. Click the sparkle icon (✨) in the Source Control panel to instantly generate a commit message from your staged diff.

## Features

- **One-click generation** — sparkle button in the SCM title bar generates a commit message from your staged (or unstaged) diff
- **Multiple AI backends** — works with GitHub Copilot, Claude CLI, Perplexity AI, or any VS Code LM provider
- **Smart fallback** — `auto` mode tries the VS Code language model API first, then falls back to the Claude CLI

## Requirements

Depending on your chosen method:

- **`auto` / `vscode-lm`** — a VS Code language model provider such as [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot)
- **`claude-cli`** — the [`claude` CLI](https://www.npmjs.com/package/@anthropic-ai/claude-code) installed and available on your `PATH`
- **`perplexity`** — a Perplexity API key (set via the command **Git Commit: Store Perplexity API Key**)

## Extension Settings

| Setting                 | Default     | Description                                                                                                                                                                                                            |
| ----------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ranCommit.method`      | `auto`      | Generation method: `auto`, `vscode-lm`, `claude-cli`, or `perplexity`                                                                                                                                                  |
| `ranCommit.modelFamily` | _(default)_ | Model family/name. For `vscode-lm`/`auto`: filter by family (e.g. `gpt-4o`, `claude-sonnet`). For `claude-cli`: model family passed to the CLI. For `perplexity`: model name portion of `vendor/model` (e.g. `sonar`). |
| `ranCommit.modelVendor` | _(default)_ | Model vendor. For `vscode-lm`/`auto`: filter by vendor (e.g. `copilot`, `anthropic`). For `perplexity`: vendor prefix in `vendor/model` (e.g. `perplexity`). Not used by `claude-cli`.                                 |

## Usage

1. Stage your changes in the Source Control panel (or leave them unstaged — the extension will use the full diff as a fallback).
2. Click the **✨ sparkle icon** in the SCM title bar.
3. The generated commit message is inserted into the commit message box, ready to edit or submit.
