# Changelog

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
