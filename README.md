# MCP ABAP ADT Configurator

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

## TUI

`mcp-conf tui` starts an interactive wizard (`ls`/`show`/`add`/`update`/`rm`/`enable`/`disable`).
- Step order: `operation` -> `client` -> `scope` (auto-skipped if only one scope is supported).
- For `add` + `sse/http`: prompts for URL, timeout, and repeatable headers.
- For `rm`/`enable`/`disable`: server name is selected from existing servers in chosen client/scope.
- Keyboard: arrow keys + Enter, Ctrl+C to cancel.

## Docs

- See `docs/CLIENT_INSTALLERS.md` for client-specific behavior, defaults, and config paths.
