# Changelog

## [0.0.3] - 2026-02-10
### Added
- Command-based CLI interface: `add`, `rm`, `ls`, `enable`, `disable`, `where`.
- `--global`/`--local` scopes with per-client validation and updated config paths.
- Claude `--all-projects` and `--project` targeting for global config operations.
- `AGENTS.md` contributor guidelines.

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
