# Changelog

## [Unreleased]

## [0.0.6] - 2026-02-12
### Added
- Interactive `tui` command implemented with `enquirer` (operation/client/scope wizard with keyboard navigation).
- HTTP/SSE TUI flow now supports timeout input and repeatable header selection from a predefined list.
- `kilo` client alias for `opencode`.

### Changed
- For stdio auth, `--env` now means session environment variables; file-based env moved to `--env-path`.
- TUI operation menu order now starts with `ls`.
- TUI automatically skips scope selection when the selected client supports only one scope.

### Fixed
- TUI stdin handling no longer fails on transient non-blocking read conditions (`EAGAIN`/`EINTR`).

## [0.0.5] - 2026-02-12
### Added
- Codex `--local` scope support (writes to `./.codex/config.toml`).

### Changed
- Docs updated to list Codex local scope and path.

## [0.0.4] - 2026-02-10
### Added
- Antigravity client support with global config path and commands.

### Changed
- Antigravity HTTP entries use `serverUrl`, and enable/disable uses `disabled: true|false`.
- Antigravity local scope reports as unsupported.
- Documentation updates for Antigravity behavior and examples.

## [0.0.3] - 2026-02-10
### Added
- Command-based CLI interface: `add`, `rm`, `ls`, `enable`, `disable`, `where`.
- `--global`/`--local` scopes with per-client validation and updated config paths.
- Claude `--all-projects` and `--project` targeting for global config operations.
- `AGENTS.md` contributor guidelines.
- Antigravity client support (add/rm/ls/where).

### Changed
- Claude HTTP transport writes `type: "http"` for both global and project configs.
- Claude enable/disable always writes status to `~/.claude.json`; local scope verifies `.mcp.json`.
- Help output is now per-command (`mcp-conf <command> --help` or `mcp-conf help <command>`).
- OpenCode global config path defaults to `~/.config/opencode/opencode.json` (Windows: `%APPDATA%\\opencode\\opencode.json`).
- Documentation updated for new commands and scope behavior.

## [0.0.2] - 2026-02-10
### Added
- Biome linting + format scripts and configuration.
- GitHub Actions CI and npm publish workflows.
- GitHub Copilot client support (project `.vscode/mcp.json`).
- OpenCode client support with `enabled` flag.

### Changed
- Claude enable/disable uses `enabledMcpServers`/`disabledMcpServers` (legacy keys are migrated).
- Default client entries are disabled for Cline/Codex/Windsurf/Goose/Claude/OpenCode.
- Codex streamable HTTP writes `http_headers` and `startup_timeout_sec`.
- Goose entries default to `enabled: false` on add.
- Streamable HTTP default-destination handling uses default broker when started with `--mcp`.

### Fixed
- Cursor/Windsurf/Cline/Codex JSON toggles now write deterministic `disabled`/`enabled` values.
- Claude path resolution matches existing project entries by real path.

## [0.0.1] - 2026-02-10
### Added
- Initial `mcp-conf` CLI for configuring MCP clients.
