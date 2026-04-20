# MCP ABAP ADT Configurator
[![Stand With Ukraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/badges/StandWithUkraine.svg)](https://stand-with-ukraine.pp.ua)

Auto-configure MCP clients for `mcp-abap-adt` and `mcp-abap-adt-proxy`.

## Install

```bash
npm install -g @mcp-abap-adt/configurator
```

## Usage

```bash
mcp-conf --client cline --env-path /path/to/.env --name abap
mcp-conf --client cline --mcp TRIAL --name abap
mcp-conf --client cline --name direct-jwt-test-001 --transport http --url http://localhost:4004/mcp/stream/http --header x-sap-url=https://... --header x-sap-client=210 --header x-sap-auth-type=jwt --header x-sap-jwt-token=...
mcp-conf --client cline --name local-mcp-sse --transport sse --url http://localhost:3001/sse
mcp-conf --client codex --name abap-http --transport http --url http://localhost:3000/mcp/stream/http
mcp-conf --client codex --name abap-http --transport http --url http://localhost:3000/mcp/stream/http --header x-mcp-destination=trial
mcp-conf --client opencode --name abap --transport http --url http://localhost:3000/mcp/stream/http
mcp-conf --client kilo --name abap --transport http --url http://localhost:3000/mcp/stream/http
mcp-conf --client copilot --name abap --transport http --url http://localhost:3000/mcp/stream/http --header x-mcp-destination=trial
mcp-conf --client qwen --name abap --transport http --url http://localhost:3000/mcp/stream/http
mcp-conf --client crush --name abap --mcp TRIAL
mcp-conf --client crush --name abap --transport http --url http://localhost:3000/mcp/stream/http
mcp-conf tui
```

### Claude: CLI vs Desktop vs Connectors

Anthropic ships several "Claude" products. `mcp-conf` configures MCP servers for two of them:

- `--client claude-cli` (alias: `--client claude`) — **Claude Code CLI**. Writes to `~/.claude.json` (global) or `./.mcp.json` (local). Supports stdio / http / sse. No restart needed.
- `--client claude-desktop` — **Claude Desktop GUI** (macOS / Windows). Writes to `claude_desktop_config.json`. Supports **stdio only**. You must restart Claude Desktop after changes. Linux is not officially supported by Anthropic.
- **claude.ai Custom Connectors** (web UI) — cloud-side remote MCP, HTTPS only. **No public API**; add them manually via Settings → Connectors. `mcp-conf` cannot touch these.

## TUI

`mcp-conf tui` starts an interactive wizard (`ls`/`show`/`add`/`update`/`rm`/`enable`/`disable`).
- Step order: `operation` -> `client` -> `scope` (auto-skipped if only one scope is supported).
- For `add` + `sse/http`: prompts for URL, timeout, and repeatable headers.
- For `rm`/`enable`/`disable`: server name is selected from existing servers in chosen client/scope.
- Keyboard: arrow keys + Enter, Ctrl+C to cancel.

## Docs

- See `docs/CLIENT_INSTALLERS.md` for client-specific behavior, defaults, and config paths.
