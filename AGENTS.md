# Repository Guidelines

## Project Structure & Module Organization
- Source: `src/` (core: `BaseClient.ts`, `StandaloneClient.ts`, `ClusterClient.ts`, folders: `commands/`, `utils/`). Entry: `src/index.ts` → built to `dist/`.
- Tests: `tests/` with `unit/`, `integration/`, `cluster/`; shared helpers in `tests/setup/` and `tests/global-setup.mjs`.
- Scripts: `scripts/` (dual‑mode test runner, Valkey start/stop, release tooling).
- Docs & meta: `README.md`, `COMPATIBILITY.md`, `MIGRATION.md`, `CHANGELOG.md`.

## Build, Test, and Development Commands
- `npm run build`: Compile TypeScript to `dist/`.
- `npm test`: Dual‑mode tests (standalone then cluster) via `scripts/test-dual-mode.sh`.
- `npm run test:cov`: Dual‑mode with c8 coverage (`text`, `html`, `lcov`).
- `npm run test:types`: Type‑check samples in `tests/types/`.
- `npm run lint` / `npm run lint:fix`: ESLint over `src` and `tests`.
- `npm run format` / `npm run format:check`: Prettier format or check.
- Valkey: `npm run valkey:start` / `valkey:stop` or `valkey:test` for an isolated local bundle.

## Coding Style & Naming Conventions
- Language: TypeScript (Node >= 18).
- Formatting: Prettier — 2‑space indent, single quotes, semicolons, width 80.
- Linting: ESLint must pass; run `npm run lint:fix` before PRs.
- Filenames: `PascalCase.ts` for classes; helpers in `src/commands/` use descriptive camelCase.
- Imports: prefer `@/` alias for `src/` when available.

## Testing Guidelines
- Runner: Node test runner; files end with `.test.mjs` under `tests/unit` or `tests/integration` (cluster‑only specs in `tests/cluster`).
- Coverage: c8 target ≥ 80% lines/branches; use `npm run test:cov`.
- Env: `VALKEY_HOST`/`VALKEY_PORT` (defaults `localhost:6383`); cluster uses `VALKEY_CLUSTER_NODES` (e.g., `localhost:17000,localhost:17001,localhost:17002`).
- Integration: start local Valkey with `npm run valkey:test`, then run tests.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits, e.g. `feat(adapter): add JSON.SET path support`, `fix(commands): prevent memory leak on reconnect`.
- PRs: include clear description, link issues, test plan/output, and update docs if behavior changes. Keep changes small and focused.

## Security & Configuration Tips
- Do not commit secrets; use env vars or a local `.env`.
- Prefer ephemeral Valkey for e2e/integration via `npm run valkey:test`.
