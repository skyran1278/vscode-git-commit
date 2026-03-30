# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm run compile      # Type-check + lint + build (dev)
pnpm run package      # Type-check + lint + build (production/minified)
pnpm run watch        # Watch mode: esbuild + tsc in parallel
pnpm run lint         # ESLint
pnpm run check-types  # TypeScript type-check only (no emit)
pnpm run format       # Prettier format
pnpm run test         # Compile tests + extension, then run vscode-test
```

To run only the unit tests (no VSCode host needed), compile first then run the test runner directly — but note that `extension.test.ts` requires a VSCode host while `generate.test.ts` uses pure Node mocks.

## Architecture

- **[src/extension.ts](src/extension.ts)** — VSCode entry point. Registers `ranCommit.generateCommit` (sparkle icon in SCM title bar), `ranCommit.storePerplexityApiKey`, and `ranCommit.selectModel`. Resolves the active git repo via `vscode.git`, fetches staged diff (falling back to unstaged), then delegates to `generateCommitMessage`.

- **[src/generate.ts](src/generate.ts)** — Selects and invokes the appropriate LLM strategy based on `ranCommit.method` setting (`auto` | `vscode-lm` | `claude-cli` | `perplexity`). `auto` tries vscode-lm first, falls back to claude-cli. The `_impl.spawnFn` export is the seam for unit test injection.

- **[src/git.ts](src/git.ts)** — Git utilities (diff fetching, repo resolution).

- **[src/strategies/](src/strategies/)** — Strategy pattern for LLM backends:
  - `claude-cli.ts` — Spawns `claude` CLI subprocess; respects `claudeCliModel` setting
  - `vscode-lm.ts` — Uses `vscode.lm` API; filters by `vscodeLmModel` setting
  - `perplexity.ts` — Calls Perplexity API; API key stored via `ranCommit.storePerplexityApiKey`

- **[src/models.ts](src/models.ts)** — `selectModel` command: shows a quick pick for model selection based on current method. Reads enum values from `package.json` for `claude-cli`/`perplexity`; queries `vscode.lm.selectChatModels` for `vscode-lm`/`auto`.

**Settings**: `ranCommit.method`, `ranCommit.claudeCliModel`, `ranCommit.perplexityModel`, `ranCommit.vscodeLmModel`

**Build**: esbuild bundles `src/extension.ts` → `dist/extension.js` (CJS, `vscode` externalized). Tests compile via `tsc` to `out/` and run via `@vscode/test-cli`.

**Two test suites**:

- `src/test/generate.test.ts` — pure unit tests, inject fake child processes via `generate._impl.spawnFn`
- `src/test/extension.test.ts` — integration tests requiring a VSCode host instance

## Key constraint

`claude-cli` strategy requires the `claude` CLI on `PATH` (`ENOENT` surfaces a user-facing error). `perplexity` requires an API key stored via the `storePerplexityApiKey` command.
