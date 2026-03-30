# Change Log

All notable changes to the "ran-commit" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.0.15]

- Added Gemini 3.1 Pro Preview and Gemini 3 Flash Preview as selectable model options

## [0.0.14]

- Add **Select Model** command to switch LLM models per method (Claude CLI, Perplexity, VS Code LM) without opening settings
- Split model settings by method (`claudeCliModel`, `perplexityModel`, `vscodeLmModel`) for clearer per-backend configuration
- Add output channel for prompt debug logging to aid troubleshooting

## [0.0.13]

- Commit messages now automatically adapt to your project's commitlint configuration, respecting custom rules and scopes
- Prompt now respects VSCode's git input validation length limits, avoiding truncated messages
- Improved conventional commits guidance with detailed rules and examples for more accurate output
- Fixed missing `revert` commit type support

## [0.0.12]

- Improved commit message generation with more detailed conventional commits rules and examples, producing higher-quality and more consistent output.

## [0.0.11]

- Improved prompt formatting and readability for more consistent LLM output

## [0.0.10]

- Improved commit message generation with detailed conventional commits rules (feat, fix, chore, ci, docs, etc.) for more consistent and structured output

## [0.0.9]

- Add GitHub Actions workflow for Open VSX Registry and VS Marketplace publishing

## [0.0.8]

- Commit messages now follow Conventional Commits format by default, with style-aware generation that adapts to your repository's existing commit history.

## [0.0.7]

- Add build artifacts and config files to `.vscodeignore`; add vsce package step before publish

## [0.0.6]

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
