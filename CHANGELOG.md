# Changelog

## [Unreleased]

## [0.1.1] - 2026-02-13
### Added
- Qwen client support (`--client qwen`) for `add`, `rm`, `ls`, `show`, `enable`, `disable`, `where`, and `update`.
- TUI client list now includes Qwen.

### Changed
- Qwen config path uses `~/.qwen/settings.json` with `mcpServers.<name>` entries.
- Help output now documents Qwen across command-specific `--client` lists.
- Antigravity/Qwen notes clarified as global-only scope.
- Documentation updated with Qwen usage examples and config location.
- Local LLM CLI directories are now ignored by Git (`.gitignore`) except Copilot-related `.vscode`.
- Biome now respects ignore files via VCS settings, so local CLI folders are excluded from `npm run lint`.

## [0.0.13] - 2026-02-13
### Changed
- `--env` now works as a named stdio auth source (same flow as `--mcp`) and writes `--env=<name>` to saved server args.
- `show` now returns raw config entry by default (exact stored settings).
- Added `show --normalized` for tooling/internal use when normalized fields are required.
- TUI stdio auth labels are now consistent:
  - `destination (--mcp=<name>)`
  - `env name (--env=<name>)`
  - `env file (--env-path=<name>)`
- TUI operation menu refreshed with grouped items and non-selectable separators.
- TUI operation labels are simplified (`ls`, `show`, `add`, `update`, `enable`, `disable`, `rm`, `exit`).
- For Claude in TUI, global scope is split into:
  - `for current project`
  - `for all projects` (uses `--all-projects`)

### Fixed
- TUI now exits cleanly on `Ctrl+C` without throwing `ERR_USE_AFTER_CLOSE`.
- Added explicit `exit` action in TUI to leave configurator without changes.

### Changed
- Added explicit `--session-env` for shell/session environment auth in stdio mode.

## [0.0.12] - 2026-02-13
### Fixed
- TUI operation order updated so `show` appears immediately after `ls`.
- `update` auth detection now correctly parses stdio auth args from existing entries for all supported forms:
  - `--env` (session env)
  - legacy `--env <path>`
  - `--env-path=<path>` and `--env-path <path>`
  - `--mcp=<destination>` and `--mcp <destination>`
- This fixes incorrect auth preselection/value handling in TUI update and prevents writing wrong stdio auth parameters to client settings.

### Changed
- Help/usage command ordering now lists `show` immediately after `ls`.
- Docs updated to reflect the new TUI command order.

## [0.0.11] - 2026-02-13
### Added
- Charmbracelet Crush MCP client support (`--client crush`).
- Crush supports global and local scopes, all three transports (stdio/sse/http), and `disabled` toggling.
- Config paths: `~/.config/crush/crush.json` (Linux/macOS), `%USERPROFILE%\AppData\Local\crush\crush.json` (Windows), `.crush.json` (local).
- New entries for Crush are added disabled by default.

### Changed
- Documentation updated with Crush usage examples, config locations, and notes.
- TUI client list now includes Crush.

## [0.0.10] - 2026-02-12
### Fixed
- Claude global path now resolves to `~/.claude.json` on macOS (for example `/Users/<username>/.claude.json`) instead of Claude Desktop config location.

### Changed
- Claude config location docs now explicitly list Linux/macOS `~/.claude.json` and Windows `%USERPROFILE%\\.claude.json`.

## [0.0.9] - 2026-02-12
### Fixed
- Cline macOS global config path now resolves to `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` instead of the Linux path.

### Changed
- Config location docs now list separate Linux and macOS paths for Cline.

## [0.0.8] - 2026-02-12
### Added
- New commands: `show` (inspect server config) and `update` (modify existing server config).
- TUI operations now include `show` and `update`.
- TUI for `rm`/`enable`/`disable`/`show`/`update` now selects server name from existing entries.

### Changed
- TUI `update` now performs transport-aware step-by-step editing:
  - `stdio`: updates startup auth source (`--mcp`, `--env`, `--env-path`)
  - `sse/http`: updates URL, timeout, and headers
- `show` output is now compact and focused (removed noisy/raw fields).
- Help and docs updated for `show`/`update` and extended TUI flow.

## [0.0.7] - 2026-02-12
### Added
- TUI now selects server name from existing configured servers for `rm`, `enable`, and `disable`.

### Changed
- Updated Biome schema to `2.3.15` to match the installed CLI version.
- TUI docs clarified for operation flow and server-selection behavior.

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
