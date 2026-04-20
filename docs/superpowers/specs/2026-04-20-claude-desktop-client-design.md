# Claude Desktop client + `claude-cli` rename

Date: 2026-04-20
Status: Approved, ready for implementation plan

## Problem

The current `--client claude` writes to `~/.claude.json` (or `./.mcp.json`), which is the **Claude Code CLI** config. Users conflate this with:

1. **Claude Desktop** (GUI app) — uses a different file (`claude_desktop_config.json`), stdio-only, requires app restart.
2. **claude.ai Custom Connectors** (web UI) — uses a separate cloud-side store with no public API; not configurable via local files at all.

There is no ambiguity in the code, but the client id `claude` and the current help text do not make the distinction obvious. Users try to add a stdio MCP with `--client claude` and then look for it in claude.ai Connectors or Claude Desktop, and don't find it.

## Goals

- Make the distinction between Claude Code CLI and Claude Desktop explicit in client ids, help text, and README.
- Add first-class support for Claude Desktop as a separate client.
- Do not break existing users (`--client claude` must keep working).

## Non-goals

- Programmatic management of claude.ai Custom Connectors. No public API exists; the user must use the web UI.
- Supporting Claude Desktop on Linux. Anthropic does not ship an official Linux build; unofficial builds use non-standard paths.
- Supporting HTTP/SSE transport in `claude_desktop_config.json`. Claude Desktop reads only stdio entries from that file; remote connectors are added exclusively via Settings → Custom Connectors.
- Automating a Claude Desktop restart after mutations.

## Design

### Client id changes

- **New canonical id:** `claude-cli` — the existing Claude Code CLI client, unchanged behavior.
- **Alias:** `claude` → `claude-cli`. Permanent, no deprecation. Internally normalized to `claude-cli` at parse time.
- **New client:** `claude-desktop` — Claude Desktop GUI.

The existing validator list (`bin/mcp-conf.js:716`) gains `claude-cli` and `claude-desktop`; `claude` stays as an alias and is mapped to `claude-cli` before any downstream logic sees it.

### `claude-desktop` behavior

**Config file paths:**

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: resolver calls `fail("Claude Desktop is not officially available on Linux. Use --client claude-cli instead.")`.

**Scope:**

- Only `global` is accepted (and is the default when scope is omitted).
- `--local` → `fail("claude-desktop does not support --local scope; it has a single global config file.")`.

**Transport:**

- Only stdio is accepted.
- `--url` or any http/sse option → `fail("claude-desktop only supports stdio transport. For remote MCP, add a Custom Connector in Claude Desktop Settings → Connectors.")`.

**JSON shape written:**

```json
{
  "mcpServers": {
    "<name>": {
      "command": "<command>",
      "args": ["..."],
      "env": { "...": "..." }
    }
  }
}
```

No `type` field (Claude Desktop infers stdio). No `url`/`headers`/`transport` keys.

**Implementation boundary:**

- `claude-desktop` uses its own helpers and must not reuse the existing Claude project-aware helpers.
- Detection must be by normalized client id, not by config filename suffix.
- In particular, `claude_desktop_config.json` is treated as a flat Desktop config only, never as a Claude Code project config with `projects[...]`.

**Enable/disable:**

Claude Desktop's config has no `disabled` flag. The configurator uses the same convention already used for other clients in this repo: move the entry between `mcpServers` and a sibling `_disabled` object.

- `disable` → move `mcpServers[name]` into `_disabled[name]`.
- `enable` → move `_disabled[name]` back into `mcpServers[name]`.
- `ls` reports disabled entries as such.
- `show` and `where` search both `mcpServers` and `_disabled`.
- `rm` removes the entry from whichever bucket it is currently in.
- `update` searches both buckets; if the entry is currently disabled, it stays in `_disabled` after update.

Claude Desktop ignores `_disabled` (unknown key), so a disabled server is effectively removed from Desktop until re-enabled.

**Restart notice:**

After every successful mutation (`add`, `rm`, `update`, `enable`, `disable`) the CLI prints:

```
Note: Restart Claude Desktop for changes to take effect.
```

Read-only commands (`ls`, `show`, `where`) do not print it.

### Help, README, CHANGELOG

- Help text for every command lists `claude-cli | claude-desktop` in the `--client` enumeration. The alias `claude` is mentioned once in the "Clients" section of the help with a sentence describing what it maps to.
- README gets a short "Claude: CLI vs Desktop vs Connectors" note explaining:
  - `claude-cli` — Claude Code CLI, stdio/http/sse, no restart needed.
  - `claude-desktop` — Claude Desktop GUI, stdio only, restart required.
  - claude.ai Custom Connectors — cloud, remote HTTPS only, must be added via the web UI (no CLI support possible; no public API).
- CHANGELOG entry under a new minor version (`0.3.0`):
  `feat: rename claude client to claude-cli (keeps claude as alias); add claude-desktop client for macOS/Windows (stdio only)`.

## Implementation touchpoints

- `bin/mcp-conf.js`:
  - Argument parser: normalize `claude` → `claude-cli`.
  - Client validator list (around line 716): add `claude-cli`, `claude-desktop`.
  - `getClaudePath()` (line 599): no change; still serves `claude-cli`.
  - New `getClaudeDesktopPath(platform, home, appData)`.
  - New `writeClaudeDesktopConfig`, `removeClaudeDesktopConfig`, `listClaudeDesktopConfig`, `showClaudeDesktopConfig`, `whereClaudeDesktopConfig`, `toggleClaudeDesktopConfig` (enable/disable). These mirror existing helpers but target the flat `claude_desktop_config.json` shape (no `projects` nesting, no scope branching).
  - Do not route `claude-desktop` through existing Claude helpers that currently infer behavior from `.claude.json` / `claude_desktop_config.json` filename suffixes.
  - Add restart-notice print at the end of each mutation path for `claude-desktop`.
  - Update `claude-cli` paths in all case branches that currently match `"claude"`.
  - Help text strings in `mcp-conf.js` and `mcp-conf-tui.js` updated accordingly.
- `bin/mcp-conf-tui.js`: add `claude-desktop` to the client picker; rename the primary `claude` picker label to `Claude CLI`; add a distinct `Claude Desktop` label for `claude-desktop`; hide transport options other than stdio when `claude-desktop` is selected; hide scope picker for `claude-desktop` (force global); keep the current Claude project/global UX only for `claude-cli`.
- `README.md`: add the Claude distinction note.
- `CHANGELOG.md`: new `0.3.0` section.
- `package.json`: bump to `0.3.0`.

## Verification

- `npm run lint` passes.
- Manual checks:
  - `node bin/mcp-conf.js add --client claude-desktop --name abap --mcp TRIAL` writes the expected file on macOS (verify via `show`/`where`).
  - `node bin/mcp-conf.js add --client claude --name abap --mcp TRIAL` still writes to `~/.claude.json` (alias works).
  - `node bin/mcp-conf.js add --client claude-desktop --url http://...` fails with the documented error.
  - `node bin/mcp-conf.js add --client claude-desktop --local ...` fails.
  - On Linux, any `--client claude-desktop` command fails with the documented error.
  - `disable`/`enable` round-trip on `claude-desktop` leaves the file in the expected state.
  - Every successful mutation on `claude-desktop` prints the restart notice; no notice on `ls`/`show`/`where`.
