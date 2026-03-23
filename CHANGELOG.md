# Change Log

All notable changes to the "ran-commit" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.0.11]

- Improved commit message generation with detailed conventional commits rules (type, scope, subject, body, footer guidelines)
- Cleaner, more readable prompt formatting for better LLM output consistency

## [0.0.10]

- Improved commit message generation with detailed conventional commits rules (feat, fix, chore, ci, docs, etc.) for more consistent and structured output

## [0.0.9]

- Added conventional commits style fallback: the prompt now detects your project's commit style and generates messages that match it

## [0.0.8]

- Commit messages now follow Conventional Commits format by default, with style-aware generation that adapts to your repository's existing commit history.

## [0.0.7]

- Lowered minimum VS Code version requirement to 1.107.0, making the extension compatible with more installations

## [0.0.6]

- Perplexity API key is now requested inline when not configured, so you no longer need to run a separate setup command
- Simplified commit message prompt for more consistent, cleaner output
- Lowered minimum VS Code version requirement to 1.107.0, expanding compatibility

## [0.0.5]

- Perplexity API key is now requested inline when not yet configured, removing the need to run a separate setup command first
- Improved commit message quality by simplifying the prompt template with clearer output instructions

## [0.0.4]

- Add `release-it` for automated releases.

## [0.0.3]

- Rename extension to **Ran - Commit Message Generator** with updated display name, description, categories, and icon.

## [0.0.2]

- Rename command prefix and package name from `git-commit` to `ranCommit`.

## [0.0.1]

- Initial release — one-click commit message generation via Claude CLI, VS Code LM API, and Perplexity AI.
- Multi-strategy LLM backend: `claude-cli`, `vscode-lm`, and `perplexity`.
- Configurable via `ranCommit.method`, `ranCommit.modelFamily`, `ranCommit.modelVendor` settings.
- Perplexity API key storage via `ranCommit.storePerplexityApiKey` command.
