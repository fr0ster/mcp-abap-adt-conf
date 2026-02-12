# Client Auto-Configure

This helper writes MCP configuration entries for popular clients.

## Install

```bash
npm install -g @mcp-abap-adt/configurator
```

## Usage

```bash
mcp-conf add --client cline --env-path /path/to/.env --name abap
mcp-conf add --client cline --mcp TRIAL --name abap
mcp-conf add --client cline --env-path /path/to/.env --name abap --transport stdio
mcp-conf add --client claude --mcp TRIAL --name abap
mcp-conf rm --client codex --name abap
mcp-conf add --client cline --name direct-jwt-test-001 --transport http --url http://localhost:4004/mcp/stream/http --header x-sap-url=https://... --header x-sap-client=210 --header x-sap-auth-type=jwt --header x-sap-jwt-token=...
mcp-conf add --client cline --name local-mcp-sse --transport sse --url http://localhost:3001/sse
mcp-conf add --client codex --name abap-http --transport http --url http://localhost:3000/mcp/stream/http
mcp-conf add --client codex --name abap-http --transport http --url http://localhost:3000/mcp/stream/http --header x-mcp-destination=trial
mcp-conf add --client opencode --name abap --transport http --url http://localhost:3000/mcp/stream/http
mcp-conf add --client kilo --name abap --transport http --url http://localhost:3000/mcp/stream/http
mcp-conf add --client copilot --name abap --transport http --url http://localhost:3000/mcp/stream/http --header x-mcp-destination=trial
mcp-conf add --client antigravity --name abap --transport http --url http://localhost:3000/mcp/stream/http
mcp-conf tui
```

## Common Tasks

Add MCP:
```bash
mcp-conf add --client codex --mcp TRIAL --name abap
mcp-conf add --client cline --env-path /path/to/.env --name abap
mcp-conf add --client claude --mcp TRIAL --name abap
mcp-conf add --client claude --name abap-http --transport http --url http://localhost:3000/mcp/stream/http --header x-mcp-destination=trial
mcp-conf add --client claude --name abap --project /path/to/project --mcp TRIAL
```

Disable MCP:
```bash
mcp-conf disable --client codex --name abap
mcp-conf disable --client cline --name abap
```

Enable MCP:
```bash
mcp-conf enable --client codex --name abap
mcp-conf enable --client cline --name abap
mcp-conf enable --client antigravity --name abap
```

Remove MCP:
```bash
mcp-conf rm --client codex --name abap
mcp-conf rm --client cline --name abap
mcp-conf rm --client claude --name abap
mcp-conf rm --client antigravity --name abap
```

List MCP servers:
```bash
mcp-conf ls --client codex
mcp-conf ls --client cline
mcp-conf ls --client claude --local
mcp-conf ls --client claude --all-projects
mcp-conf ls --client antigravity --global
```

Find where a server is defined:
```bash
mcp-conf where --client codex --name abap
mcp-conf where --client claude --name goose --project /path/to/project
mcp-conf where --client claude --name goose --all-projects
```

TUI wizard:
```bash
mcp-conf tui
```
- Flow order: `operation` -> `client` -> `scope`.
- Scope step is skipped automatically for single-scope clients.
- For `add` with `sse/http`, the wizard asks URL, timeout, and repeatable headers.
- For `rm`/`enable`/`disable`, the wizard shows existing server names for selection.
- Controls: arrow keys + Enter, Ctrl+C to cancel.

Options:
- Commands: `add`, `rm`, `ls`, `enable`, `disable`, `where`, `show`, `update`, `tui` (first argument)
- `--client <name>` (repeatable): `cline`, `codex`, `claude`, `goose`, `cursor`, `windsurf`, `opencode` (`kilo` alias), `copilot`, `antigravity`
- `--env`: use shell/session environment variables (stdio only)
- `--env-path <path>`: use a specific `.env` file (stdio only)
- `--mcp <destination>`: use service key destination
- `--name <serverName>`: MCP server name (required)
- `--transport <type>`: `stdio`, `sse`, or `http` (`http` maps to `streamableHttp`)
- `--command <bin>`: command to run (default: `mcp-abap-adt`)
- `--global`: write to the global user config (default)
- `--local`: write to the project config (supported by `cursor`, `opencode`/`kilo`, `copilot`, `claude`, `codex`)
- `--all-projects`: for Claude (global scope), apply `rm/enable/disable/ls/where` across all projects
- `--project <path>`: for Claude (global scope), target a specific project path
- `--url <http(s)://...>`: required for `sse` and `http`
- `--header key=value`: add request header (repeatable)
- `--timeout <seconds>`: timeout value for client entries (default: 60)
- `--json`: JSON-only output for `show`

Notes:
- `disable` and `rm` do not require `--env`, `--env-path`, or `--mcp`.
- `--env`/`--env-path`/`--mcp` are only valid for `stdio` transport. For `sse/http`, use `--url` and optional `--header`.
- `mcp-conf tui` starts an interactive wizard for `ls`/`add`/`show`/`update`/`rm`/`enable`/`disable`.
- Cursor/Copilot enable/disable are not implemented yet.
- Antigravity enable/disable uses `disabled: true|false` on the entry.
- Antigravity local scope is not supported yet; use `--global`.
- Claude stores enable/disable state under `enabledMcpServers` and `disabledMcpServers` for each project.
- Claude enable/disable always updates `~/.claude.json` (global scope), even if you pass `--local`.
- Antigravity HTTP entries use `serverUrl` instead of `url`.
- New entries for Cline, Codex, Windsurf, Goose, Claude, and OpenCode are added **disabled by default**. Use `enable` to turn them on.
- Windsurf follows `disabled` like Cline. The configurator sets `disabled = true` for default-disabled entries.
- `enable`/`disable` only work if the server entry already exists. Use add commands with `--env`, `--env-path`, or `--mcp` first.
- Non-stdio transports are supported for Cline/Cursor/Windsurf/Claude/Goose. Codex supports `http` (streamable HTTP) but not `sse`.
- Codex writes custom headers under `http_headers` in `~/.codex/config.toml` (or `./.codex/config.toml` for `--local`).
- Codex HTTP entries include `startup_timeout_sec` (default: 60).
- `--dry-run`: print changes without writing files
- `--force`: overwrite existing server entry if it exists
- Scope defaults to `--global` (GitHub Copilot is `--local` only).
- For Claude, `--local` maps to the documented project scope file `./.mcp.json`.

## Config Locations

Paths are client-specific and OS-dependent. The installer writes config files in:

Global (default) locations:
- **Cline**:
  - Linux/macOS: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
  - Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
- **Codex**:
  - Linux/macOS: `~/.codex/config.toml`
  - Windows: `%USERPROFILE%\.codex\config.toml`
  - Local (project): `./.codex/config.toml`
- **Claude Code (CLI)**:
  - Linux default: `~/.claude.json` (per-project entries under `projects.<cwd>.mcpServers`)
- **Claude Desktop**:
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- **Goose**:
  - Linux/macOS: `~/.config/goose/config.yaml`
  - Windows: `%APPDATA%\Block\goose\config\config.yaml`
- **Cursor**:
  - Linux/macOS: `~/.cursor/mcp.json`
  - Windows: `%USERPROFILE%\.cursor\mcp.json`
- **Windsurf**:
  - Linux/macOS: `~/.codeium/windsurf/mcp_config.json`
  - Windows: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`
- **OpenCode**:
  - Linux/macOS: `~/.config/opencode/opencode.json`
  - Windows: `%APPDATA%\opencode\opencode.json`
- **Antigravity**:
  - Linux/macOS: `~/.gemini/antigravity/mcp_config.json`

Local (project) locations:
- **Claude Code**:
  - Project: `./.mcp.json`
- **Cursor**:
  - Project: `./.cursor/mcp.json`
- **OpenCode**:
  - Project: `./opencode.json` (uses `mcp.<name>` entries with `enabled: true|false`)
- **GitHub Copilot**:
  - Project: `./.vscode/mcp.json` (uses `servers.<name>` entries)
- **Antigravity**:
  - Project: `./.antigravity/mcp.json` (community-reported; not supported yet)
