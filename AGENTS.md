# Repository Guidelines

## Project Structure & Module Organization
- Source: `src/` (core: `BaseClient.ts`, `StandaloneClient.ts`, `ClusterClient.ts`, `commands/`, `utils/`). Entry: `src/index.ts` → built to `dist/`.
- Tests: `tests/` organized by `unit/`, `integration/`, `cluster/`, plus helpers in `tests/setup/` and `tests/global-setup.mjs`.
- Scripts: `scripts/` (test runners, Valkey bundle start/stop, release utils).
- Docs & meta: `README.md`, `COMPATIBILITY.md`, `MIGRATION.md`, `CHANGELOG.md`.

## Build, Test, and Development Commands
- `npm run build`: Compile TypeScript to `dist/`.
- `npm test`: Run Node’s test runner via `scripts/test-runner-batch.sh` (batches `.test.mjs`).
- `npm run test:cov`: Same as above with c8 coverage reports (`text`, `html`, `lcov`).
- `npm run test:types`: Type-check sample types in `tests/types/`.
- `npm run lint` / `lint:fix`: ESLint over `src` and `tests` (fixes with `--fix`).
- `npm run format` / `format:check`: Prettier format or check.
- Local Valkey for integration tests: `npm run valkey:start` / `valkey:stop` or `valkey:test`.

## Coding Style & Naming Conventions
- Language: TypeScript (Node >= 18).
- Prettier: 2-space indent, single quotes, semicolons, width 80.
- Filenames: `PascalCase.ts` for classes; command helpers under `src/commands/` use descriptive camelCase.
- Imports: use `@/` alias for `src/` in TS/Jest where applicable.

## Testing Guidelines
- Primary runner: Node test runner (`.test.mjs`); place tests under `tests/unit` or `tests/integration`.
- Global setup: `tests/global-setup.mjs` and `tests/setup/` utilities.
- Coverage: c8 reports; target ≥ 80% lines/branches (see `jest.config.js` thresholds).
- Env: `VALKEY_HOST`/`VALKEY_PORT` for local Valkey; defaults to `localhost:6379`.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits (see `.gitmessage`). Examples:
  - `feat(adapter): add JSON.SET path support`
  - `fix(commands): prevent memory leak on reconnect`
- PRs: clear description, link issues, include test plan/output, update docs if behavior changes. Prefer small, focused changes.

## Security & Configuration Tips
- Do not commit secrets. Use env vars or `.env` locally.
- Run `npm run valkey:test` to spin up an isolated Valkey bundle for e2e/integration.
