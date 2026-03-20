# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MCP ABAP ADT Configurator (`@mcp-abap-adt/configurator`) — an npm CLI tool that auto-configures MCP clients to work with `mcp-abap-adt` and `mcp-abap-adt-proxy` servers. Published as a global npm package.

## Commands

- `npm run lint` — run Biome checks (also what `npm run build` does)
- `npm run format` — auto-format all files with Biome
- `node bin/mcp-conf.js <command>` — run CLI during development (e.g., `node bin/mcp-conf.js add claude --url http://...`)

There is no automated test suite. Validate changes with `npm run lint` and manual CLI runs.

## Architecture

Two main files in `bin/`:

- **`mcp-conf.js`** — Main CLI entry point. Handles argument parsing, config read/write for all supported clients, and dispatches commands (`add`, `rm`, `ls`, `show`, `enable`, `disable`, `where`, `update`, `tui`, `help`).
- **`mcp-conf-tui.js`** — Interactive TUI wizard. Spawned as a subprocess by `mcp-conf.js`; communicates results back via fd 3 as JSON.

Each client (cline, claude, codex, goose, cursor, copilot, opencode/kilo, windsurf, antigravity, qwen, gemini, crush) has:
- A path resolver function (`get<Client>Path()`) returning OS-specific config file locations
- Scope support (global, local, or both) — varies per client
- Config format handlers (most use JSON; goose uses YAML; codex uses TOML-like)

Transport modes: `stdio` (with `--env`/`--env-path`/`--mcp`/`--session-env` auth), `http`, `sse` (with `--url`, `--header`, `--timeout`).

## Code Style

Enforced by Biome (`biome.json`): 2-space indent, 100-char line width, double quotes, semicolons.

## Language

- All artifacts (code, docs, commits, file contents) must be in English.
- Communicate with the user in whatever language they use (match the user's language).

## Conventions

- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:` prefixes
- Update `CHANGELOG.md` when behavior changes
- Do not commit generated client config files or `.env` files
