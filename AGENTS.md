# Repository Guidelines

## Project Structure & Module Organization
- `bin/mcp-conf.js` is the CLI entry point (published as `mcp-conf`).
- `docs/` contains user-facing documentation, including client installer behavior in `docs/CLIENT_INSTALLERS.md`.
- Root files (`package.json`, `biome.json`, `CHANGELOG.md`) define tooling, formatting, and release notes.

## Build, Test, and Development Commands
- `npm run lint`: run Biome checks across the repo.
- `npm run format`: format all files in-place with Biome.
- `npm run build`: currently aliases `npm run lint` for CI-style validation.
- `mcp-conf ...`: run the installed CLI; during development you can invoke `node bin/mcp-conf.js ...`.

## Coding Style & Naming Conventions
- Formatting and linting are enforced by Biome (`biome.json`).
- Indentation is 2 spaces, line width is 100.
- JavaScript uses double quotes and semicolons.
- Prefer descriptive, CLI-oriented option names (examples in `docs/CLIENT_INSTALLERS.md`).

## Testing Guidelines
- No automated test suite is defined yet.
- Validate changes with `npm run lint` and manual CLI runs using sample commands from `docs/CLIENT_INSTALLERS.md`.
- When adding tests, keep naming explicit (e.g., `*.test.js`) and document how to run them here.

## Commit & Pull Request Guidelines
- Commit history shows Conventional Commit-style prefixes (e.g., `chore:`) and occasional version-tag commits like `0.0.2`.
- Prefer `type: summary` format (`chore:`, `docs:`, `feat:`, `fix:`) and update `CHANGELOG.md` when behavior changes.
- PRs should include:
  - A short summary of the change.
  - A note on how you verified it (lint, manual CLI run).
  - Docs updates if CLI flags or behavior change.

## Configuration & Safety Notes
- The CLI writes to user config locations per client; avoid committing any generated config files.
- Keep `.env` files local and reference them via `--env` when needed.
