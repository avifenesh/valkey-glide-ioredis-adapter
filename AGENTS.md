# Repository Guidelines

## Project Structure & Module Organization
- Source: `src/` (core: `BaseClient.ts`, `StandaloneClient.ts`, `ClusterClient.ts`, `commands/`, `utils/`). Entry: `src/index.ts` → built to `dist/`.
- Tests: `tests/` with `unit/`, `integration/`, `cluster/`; shared helpers in `tests/setup/` and `tests/global-setup.mjs`.
- Scripts: `scripts/` (test runners, Valkey bundle start/stop, release utilities).
- Docs & meta: `README.md`, `COMPATIBILITY.md`, `MIGRATION.md`, `CHANGELOG.md`.

## Build, Test, and Development Commands
- `npm run build`: Compile TypeScript to `dist/`.
- `npm test`: Dual-mode runner; executes standalone tests then cluster tests (`scripts/test-dual-mode.sh`).
- `npm run test:cov`: Dual-mode with c8 coverage (`text`, `html`, `lcov`).
- `npm run test:types`: Type‑check sample types in `tests/types/`.
- `npm run lint` / `npm run lint:fix`: ESLint over `src` and `tests` (auto‑fix with `--fix`).
- `npm run format` / `npm run format:check`: Prettier format or check.
- Local Valkey: `npm run valkey:start` / `npm run valkey:stop` or `npm run valkey:test` (isolated bundle for integration).

## Coding Style & Naming Conventions
- Language: TypeScript (Node >= 18).
- Formatting: Prettier — 2‑space indent, single quotes, semicolons, width 80.
- Linting: ESLint must pass; use `npm run lint:fix` before PRs.
- Filenames: `PascalCase.ts` for classes; command helpers in `src/commands/` use descriptive camelCase.
- Imports: prefer `@/` alias for `src/` when available.

## Testing Guidelines
- Runner: Node test runner; tests end with `.test.mjs` under `tests/unit` or `tests/integration` (cluster specs in `tests/cluster`).
- Modes: Dual-mode runs standalone first, then cluster (cluster-only specs live under `tests/cluster`).
- Coverage: c8 reports with target ≥ 80% lines/branches.
- Env: `VALKEY_HOST` / `VALKEY_PORT` (defaults `localhost:6383`). Cluster uses `VALKEY_CLUSTER_NODES` (e.g., `localhost:17000,localhost:17001,localhost:17002`). For integration, start a local bundle via `npm run valkey:test`.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits. Examples:
  - `feat(adapter): add JSON.SET path support`
  - `fix(commands): prevent memory leak on reconnect`
- PRs: clear description, link issues, include test plan/output, and update docs if behavior changes. Keep changes small and focused.

## Security & Configuration Tips
- Do not commit secrets. Use env vars or a local `.env`.
- Prefer ephemeral Valkey for e2e/integration via `npm run valkey:test`.
