# Claude Desktop client + `claude-cli` rename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the current `--client claude` into two distinct clients — `claude-cli` (Claude Code CLI, existing behavior; `claude` kept as permanent alias) and a new `claude-desktop` (Claude Desktop GUI, stdio-only).

**Architecture:** Pure additive change to `bin/mcp-conf.js` and `bin/mcp-conf-tui.js`. Rename the existing `"claude"` case-label and string constants to `"claude-cli"`; alias `claude` in `normalizeClientName`. Add a separate family of helpers (`*ClaudeDesktopConfig`) that read/write the flat `claude_desktop_config.json` shape (top-level `mcpServers` + sibling `_disabled` bucket for disabled entries). No shared code with the project-nested Claude Code helpers, per spec's "Implementation boundary".

**Tech Stack:** Node.js (no build step), Biome (`npm run lint` / `npm run format`), `enquirer` for TUI. No test framework — verification is via CLI invocations and JSON inspection.

**Spec reference:** `docs/superpowers/specs/2026-04-20-claude-desktop-client-design.md`

**Platform note:** The reference developer machine in the verification steps is Linux. Where a step writes to `claude_desktop_config.json`, override the path with the env var `CLAUDE_DESKTOP_CONFIG_OVERRIDE=/tmp/cdc.json` trick is **not** available — the code resolves paths via `os.platform()`. Instead, verification uses a temporary copy: on Linux we run `--client claude-desktop` to confirm the resolver fails; for actual write-path verification we spoof `HOME` to a tmp dir and run on a Mac-like path by monkey-patching via a tiny wrapper shown in the relevant task. If you are implementing this on a real macOS/Windows machine, skip the spoof and use the real config path.

---

## File Structure

**Modify:**
- `bin/mcp-conf.js` — alias, dispatch, new helpers, help text.
- `bin/mcp-conf-tui.js` — client list entries, scope/transport gating for `claude-desktop`.
- `README.md` — "Claude: CLI vs Desktop vs Connectors" note, examples.
- `CHANGELOG.md` — 0.3.0 entry.
- `package.json` — version bump.

**Create:**
- None. All new logic lives inside `bin/mcp-conf.js` next to the existing Claude helpers.

**Do not touch:**
- The existing `writeClaudeConfig` / `listClaudeConfig` / `showClaudeConfig` / `whereClaudeConfig` / `resolveClaudeProjectKey` / `claudeLocalHasServer` functions. They continue to serve `claude-cli`. New helpers live alongside them and have disjoint call sites.

---

## Task 1: Alias `claude` → `claude-cli`, rename internal references

**Goal:** Make `claude-cli` the canonical id. `--client claude` continues to work via `normalizeClientName`. No new behavior.

**Files:**
- Modify: `bin/mcp-conf.js` — `normalizeClientName` (line 514), `getDefaultDisabled` validator (line 716), dispatch case (lines 302, 337), and string occurrences at lines 950, 1478, 1511, 1522.

- [ ] **Step 1: Update `normalizeClientName` to alias `claude` → `claude-cli`**

Replace the function body at `bin/mcp-conf.js:514-520`:

```js
function normalizeClientName(clientName) {
  if (!clientName) {
    return clientName;
  }
  const normalized = clientName.toLowerCase();
  if (normalized === "kilo") {
    return "opencode";
  }
  if (normalized === "claude") {
    return "claude-cli";
  }
  return normalized;
}
```

- [ ] **Step 2: Update the validator list in `getDefaultDisabled`**

Replace `bin/mcp-conf.js:716`:

```js
  return ["cline", "codex", "windsurf", "goose", "claude-cli", "opencode", "crush"].includes(
```

- [ ] **Step 3: Rename the dispatch case label from `"claude"` to `"claude-cli"`**

In the `switch (client)` block inside `for (const client of options.clients)`, replace `case "claude": {` at line 337 with:

```js
    case "claude-cli": {
```

And update the guard at line 302:

```js
    if (options.projectPath && client !== "claude-cli") {
      fail("--project is only supported for Claude.");
    }
```

Leave the human-readable string `"Claude"` passed to `requireScope("Claude", ...)` at line 338 as-is — that's user-facing copy.

- [ ] **Step 4: Update internal `clientType` string constants**

At `bin/mcp-conf.js:950`, replace:

```js
      : options.disabled || getDefaultDisabled("claude");
```

with:

```js
      : options.disabled || getDefaultDisabled("claude-cli");
```

At lines 1478, 1511, 1522, replace `normalizeServerDetails("claude", ...)` with `normalizeServerDetails("claude-cli", ...)` — three call sites total. Grep to confirm you updated all of them:

```bash
grep -n 'normalizeServerDetails("claude"' bin/mcp-conf.js
# Expected: no matches
```

- [ ] **Step 5: Check `normalizeServerDetails` accepts the new id**

Read `bin/mcp-conf.js` around the `normalizeServerDetails` definition (find it via `grep -n "function normalizeServerDetails" bin/mcp-conf.js`). If the function switches on the client id and has a `"claude"` branch, add a `"claude-cli"` branch that behaves identically, or widen the existing branch: `if (clientType === "claude" || clientType === "claude-cli")`. If it does not switch on the id, no change needed — move on.

- [ ] **Step 6: Lint**

```bash
npm run lint
```

Expected: pass.

- [ ] **Step 7: Manual verify — alias still works**

```bash
node bin/mcp-conf.js add --client claude --name abap-test-alias --mcp TRIAL --global --force
node bin/mcp-conf.js show --client claude --name abap-test-alias --global
node bin/mcp-conf.js rm --client claude --name abap-test-alias --global
```

Expected: all three commands exit 0 and the entry appears then disappears in `~/.claude.json`.

- [ ] **Step 8: Manual verify — new canonical id works**

```bash
node bin/mcp-conf.js add --client claude-cli --name abap-test-canon --mcp TRIAL --global --force
node bin/mcp-conf.js show --client claude-cli --name abap-test-canon --global
node bin/mcp-conf.js rm --client claude-cli --name abap-test-canon --global
```

Expected: all three commands exit 0 and JSON file round-trips as expected.

- [ ] **Step 9: Commit**

```bash
git add bin/mcp-conf.js
git commit -m "refactor: rename internal claude client id to claude-cli (keep claude alias)"
```

---

## Task 2: Add `getClaudeDesktopPath` resolver

**Goal:** Introduce the path resolver for `claude-desktop`. No dispatch wiring yet — just the function.

**Files:**
- Modify: `bin/mcp-conf.js` — add the new function directly below `getClaudePath` (currently lines 599-604).

- [ ] **Step 1: Add the resolver**

Insert immediately after `getClaudePath` (after line 604):

```js
function getClaudeDesktopPath(platformValue, homeDir, appDataDir) {
  if (platformValue === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (platformValue === "win32") {
    return path.join(appDataDir, "Claude", "claude_desktop_config.json");
  }
  fail("Claude Desktop is not officially available on Linux. Use --client claude-cli instead.");
}
```

Note: `fail` is defined at the top of the file and exits the process; it never returns, so the function does not need an explicit `return` on the Linux branch. The TypeScript-style `never` is implicit.

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add bin/mcp-conf.js
git commit -m "feat: add getClaudeDesktopPath resolver for claude-desktop client"
```

---

## Task 3: Add `writeClaudeDesktopConfig` (add/update) + dispatch with restart notice

**Goal:** Wire up `--client claude-desktop add` and `--client claude-desktop update`. Guard against non-stdio transport and non-global scope. Print restart notice on success.

**Files:**
- Modify: `bin/mcp-conf.js` — add helper next to `writeClaudeConfig`; add `case "claude-desktop"` to dispatch.

- [ ] **Step 1: Add the helper**

Insert after the closing `}` of `writeClaudeConfig` (search for `^function writeClaudeDesktopConfig` to make sure it doesn't already exist). Place it before the next function definition:

```js
function writeClaudeDesktopConfig(filePath, serverName, argsArray) {
  ensureDir(filePath);
  const data = readJson(filePath);
  data.mcpServers = data.mcpServers || {};
  data._disabled = data._disabled || {};
  const exists = data.mcpServers[serverName] || data._disabled[serverName];
  if (exists && !options.force) {
    fail(`Server "${serverName}" already exists in ${filePath}. Use --force to overwrite.`);
  }
  const entry = {
    command: options.command,
    args: argsArray,
    timeout: options.timeout,
    env: {},
  };
  if (data._disabled[serverName]) {
    // Preserve disabled state on update.
    data._disabled[serverName] = entry;
  } else {
    data.mcpServers[serverName] = entry;
    delete data._disabled[serverName];
  }
  writeFile(filePath, JSON.stringify(data, null, 2));
}

function printClaudeDesktopRestartNotice() {
  console.log("Note: Restart Claude Desktop for changes to take effect.");
}
```

- [ ] **Step 2: Add dispatch `case "claude-desktop"` — add/update path only for now**

Insert a new case inside `switch (client)` in `bin/mcp-conf.js` (near the existing `case "claude-cli":` block). Use this complete block — later tasks extend it:

```js
    case "claude-desktop": {
      requireScope("ClaudeDesktop", ["global"], scope);
      if (options.transport !== "stdio") {
        fail(
          "claude-desktop only supports stdio transport. For remote MCP, add a Custom Connector in Claude Desktop Settings → Connectors.",
        );
      }
      if (options.allProjects || options.projectPath) {
        fail("--all-projects and --project are not supported for claude-desktop.");
      }
      const cdPath = getClaudeDesktopPath(platform, home, appData);
      if (options.list) {
        fail("ls for claude-desktop not implemented yet."); // Replaced in Task 6.
      } else if (options.show) {
        fail("show for claude-desktop not implemented yet."); // Replaced in Task 6.
      } else if (options.where) {
        fail("where for claude-desktop not implemented yet."); // Replaced in Task 6.
      } else if (options.remove) {
        fail("rm for claude-desktop not implemented yet."); // Replaced in Task 4.
      } else if (options.toggle) {
        fail("enable/disable for claude-desktop not implemented yet."); // Replaced in Task 5.
      } else {
        writeClaudeDesktopConfig(cdPath, options.name, serverArgs);
        printClaudeDesktopRestartNotice();
      }
      break;
    }
```

Also update the existing scope requirement logic: `requireScope` is defined elsewhere in the file — find it via `grep -n "function requireScope" bin/mcp-conf.js` and confirm passing `["global"]` produces the right error message when `scope === "local"`. If `scope` defaults to `null`, add default-to-global handling inside the case:

```js
      if (!scope) {
        // no-op: requireScope treats null as default; but if it rejects null, fall through to global.
      }
```

Use the existing pattern from `case "cline":` (line 306-317) for how it handles the `scope` default. The simplest consistent approach: let `getDefaultScope(client)` handle it. Ensure `getDefaultScope` returns `"global"` for `claude-desktop` — find the function via grep and add a branch if needed:

```js
function getDefaultScope(clientType) {
  // existing branches...
  if (clientType === "claude-desktop") {
    return "global";
  }
  // existing fallthrough...
}
```

Read the current `getDefaultScope` before editing to match its existing style. If it already returns `"global"` as a universal default, no change needed.

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: pass.

- [ ] **Step 4: Manual verify — Linux rejects claude-desktop**

On a Linux dev machine:

```bash
node bin/mcp-conf.js add --client claude-desktop --name abap --mcp TRIAL
```

Expected: exit nonzero, stderr contains `Claude Desktop is not officially available on Linux. Use --client claude-cli instead.`

- [ ] **Step 5: Manual verify — transport guard**

```bash
node bin/mcp-conf.js add --client claude-desktop --name abap --transport http --url https://example.com 2>&1 | head -5
```

Expected: exit nonzero, message: `claude-desktop only supports stdio transport. For remote MCP, add a Custom Connector in Claude Desktop Settings → Connectors.`

- [ ] **Step 6: Manual verify — scope guard**

```bash
node bin/mcp-conf.js add --client claude-desktop --name abap --mcp TRIAL --local 2>&1 | head -5
```

Expected: exit nonzero, an error from `requireScope` that mentions `ClaudeDesktop` and `global`.

- [ ] **Step 7: Manual verify — write path (macOS/Windows only)**

Skip on Linux. On macOS or Windows:

```bash
node bin/mcp-conf.js add --client claude-desktop --name abap-test-desktop --mcp TRIAL --force
```

Expected: exit 0. Output contains `Note: Restart Claude Desktop for changes to take effect.` File `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) contains:

```json
{
  "mcpServers": {
    "abap-test-desktop": {
      "command": "mcp-abap-adt",
      "args": ["--transport=stdio", "--mcp=trial"],
      "timeout": 60,
      "env": {}
    }
  }
}
```

Leave the entry in place — later tasks remove it.

- [ ] **Step 8: Commit**

```bash
git add bin/mcp-conf.js
git commit -m "feat: add claude-desktop client with add/update (stdio only)"
```

---

## Task 4: Implement `rm` for `claude-desktop`

**Goal:** `rm` deletes the entry from whichever bucket it currently lives in (`mcpServers` or `_disabled`).

**Files:**
- Modify: `bin/mcp-conf.js` — add helper, replace the `rm` placeholder in the dispatch.

- [ ] **Step 1: Add `removeClaudeDesktopConfig`**

Place immediately after `writeClaudeDesktopConfig`:

```js
function removeClaudeDesktopConfig(filePath, serverName) {
  const data = readJson(filePath);
  const inEnabled = data.mcpServers?.[serverName];
  const inDisabled = data._disabled?.[serverName];
  if (!inEnabled && !inDisabled) {
    fail(`Server "${serverName}" not found in ${filePath}.`);
  }
  if (inEnabled) {
    delete data.mcpServers[serverName];
  }
  if (inDisabled) {
    delete data._disabled[serverName];
  }
  writeFile(filePath, JSON.stringify(data, null, 2));
}
```

- [ ] **Step 2: Wire into dispatch**

In the `case "claude-desktop":` block, replace the `options.remove` placeholder branch with:

```js
      } else if (options.remove) {
        removeClaudeDesktopConfig(cdPath, options.name);
        printClaudeDesktopRestartNotice();
```

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: pass.

- [ ] **Step 4: Manual verify (macOS/Windows)**

```bash
node bin/mcp-conf.js add --client claude-desktop --name abap-rm-test --mcp TRIAL --force
node bin/mcp-conf.js rm --client claude-desktop --name abap-rm-test
```

Expected: second command exits 0, prints restart notice, and the entry is gone from the config file. A third invocation of `rm` should fail with `not found`.

- [ ] **Step 5: Commit**

```bash
git add bin/mcp-conf.js
git commit -m "feat: claude-desktop rm support"
```

---

## Task 5: Implement `enable`/`disable` (toggle) for `claude-desktop`

**Goal:** `disable` moves the entry from `mcpServers` → `_disabled`; `enable` moves it back. Fail if entry is already in the target state.

**Files:**
- Modify: `bin/mcp-conf.js` — add helper, replace toggle placeholder in dispatch.

- [ ] **Step 1: Add `toggleClaudeDesktopConfig`**

Place after `removeClaudeDesktopConfig`:

```js
function toggleClaudeDesktopConfig(filePath, serverName, shouldDisable) {
  const data = readJson(filePath);
  data.mcpServers = data.mcpServers || {};
  data._disabled = data._disabled || {};
  if (shouldDisable) {
    if (data._disabled[serverName]) {
      fail(`Server "${serverName}" is already disabled in ${filePath}.`);
    }
    if (!data.mcpServers[serverName]) {
      fail(`Server "${serverName}" not found in ${filePath}.`);
    }
    data._disabled[serverName] = data.mcpServers[serverName];
    delete data.mcpServers[serverName];
  } else {
    if (data.mcpServers[serverName]) {
      fail(`Server "${serverName}" is already enabled in ${filePath}.`);
    }
    if (!data._disabled[serverName]) {
      fail(`Server "${serverName}" not found in ${filePath}.`);
    }
    data.mcpServers[serverName] = data._disabled[serverName];
    delete data._disabled[serverName];
  }
  writeFile(filePath, JSON.stringify(data, null, 2));
}
```

- [ ] **Step 2: Wire into dispatch**

Replace the `options.toggle` placeholder branch in `case "claude-desktop":` with:

```js
      } else if (options.toggle) {
        toggleClaudeDesktopConfig(cdPath, options.name, options.disabled);
        printClaudeDesktopRestartNotice();
```

Note: the existing dispatch uses `options.toggle` for both `enable` and `disable`, and `options.disabled` tells which direction. Confirm this by reading how the top-level action parser sets these flags — search for `options.toggle =` and `options.disabled =` in the file.

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: pass.

- [ ] **Step 4: Manual verify (macOS/Windows)**

```bash
node bin/mcp-conf.js add     --client claude-desktop --name abap-toggle --mcp TRIAL --force
node bin/mcp-conf.js disable --client claude-desktop --name abap-toggle
# Expect: entry moved to _disabled.abap-toggle
node bin/mcp-conf.js disable --client claude-desktop --name abap-toggle 2>&1 | head -3
# Expect: fails with "already disabled"
node bin/mcp-conf.js enable  --client claude-desktop --name abap-toggle
# Expect: entry moved back to mcpServers.abap-toggle
node bin/mcp-conf.js rm      --client claude-desktop --name abap-toggle
```

Inspect the JSON between steps to confirm buckets.

- [ ] **Step 5: Commit**

```bash
git add bin/mcp-conf.js
git commit -m "feat: claude-desktop enable/disable via _disabled bucket"
```

---

## Task 6: Implement `ls`, `show`, `where` for `claude-desktop`

**Goal:** Read commands search both buckets and surface disabled state.

**Files:**
- Modify: `bin/mcp-conf.js` — three helpers, replace three placeholders.

- [ ] **Step 1: Add `listClaudeDesktopConfig`**

Place after `toggleClaudeDesktopConfig`:

```js
function listClaudeDesktopConfig(filePath) {
  const data = readJson(filePath);
  const enabled = Object.keys(data.mcpServers || {});
  const disabled = Object.keys(data._disabled || {});
  if (enabled.length === 0 && disabled.length === 0) {
    console.log(`(no MCP servers configured in ${filePath})`);
    return;
  }
  for (const name of enabled.sort()) {
    console.log(name);
  }
  for (const name of disabled.sort()) {
    console.log(`${name} (disabled)`);
  }
}
```

- [ ] **Step 2: Add `showClaudeDesktopConfig`**

```js
function showClaudeDesktopConfig(filePath, serverName) {
  const data = readJson(filePath);
  const entry = data.mcpServers?.[serverName] || data._disabled?.[serverName];
  if (!entry) {
    fail(`Server "${serverName}" not found in ${filePath}.`);
  }
  const isDisabled = Boolean(data._disabled?.[serverName]);
  const output = {
    name: serverName,
    disabled: isDisabled,
    ...entry,
  };
  console.log(JSON.stringify(output, null, 2));
}
```

- [ ] **Step 3: Add `whereClaudeDesktopConfig`**

```js
function whereClaudeDesktopConfig(filePath, serverName) {
  const data = readJson(filePath);
  if (!data.mcpServers?.[serverName] && !data._disabled?.[serverName]) {
    fail(`Server "${serverName}" not found in ${filePath}.`);
  }
  console.log(filePath);
}
```

- [ ] **Step 4: Wire into dispatch**

Replace the three remaining placeholders in `case "claude-desktop":`:

```js
      if (options.list) {
        listClaudeDesktopConfig(cdPath);
      } else if (options.show) {
        showClaudeDesktopConfig(cdPath, options.name);
      } else if (options.where) {
        whereClaudeDesktopConfig(cdPath, options.name);
      } else if (options.remove) {
        // (from Task 4)
        removeClaudeDesktopConfig(cdPath, options.name);
        printClaudeDesktopRestartNotice();
      } else if (options.toggle) {
        // (from Task 5)
        toggleClaudeDesktopConfig(cdPath, options.name, options.disabled);
        printClaudeDesktopRestartNotice();
      } else {
        writeClaudeDesktopConfig(cdPath, options.name, serverArgs);
        printClaudeDesktopRestartNotice();
      }
```

No restart notice on read-only commands.

- [ ] **Step 5: Lint**

```bash
npm run lint
```

Expected: pass.

- [ ] **Step 6: Manual verify (macOS/Windows)**

```bash
node bin/mcp-conf.js add     --client claude-desktop --name abap-a --mcp TRIAL --force
node bin/mcp-conf.js add     --client claude-desktop --name abap-b --mcp TRIAL --force
node bin/mcp-conf.js disable --client claude-desktop --name abap-b
node bin/mcp-conf.js ls      --client claude-desktop
# Expected output (order may vary):
#   abap-a
#   abap-b (disabled)
node bin/mcp-conf.js show    --client claude-desktop --name abap-b
# Expected: JSON with "disabled": true
node bin/mcp-conf.js where   --client claude-desktop --name abap-b
# Expected: absolute path to claude_desktop_config.json
# Cleanup:
node bin/mcp-conf.js rm      --client claude-desktop --name abap-a
node bin/mcp-conf.js rm      --client claude-desktop --name abap-b
```

Confirm no restart notice is printed by `ls`/`show`/`where`.

- [ ] **Step 7: Commit**

```bash
git add bin/mcp-conf.js
git commit -m "feat: claude-desktop ls/show/where"
```

---

## Task 7: TUI updates

**Goal:** Add `Claude Desktop` to the TUI client list, rename the existing `Claude` entry to `Claude CLI`, force stdio + global for `claude-desktop`.

**Files:**
- Modify: `bin/mcp-conf-tui.js` — `CLIENTS` (lines 8-21), client-specific gating (around lines 280-299).

- [ ] **Step 1: Update the `CLIENTS` array**

Replace lines 8-21 in `bin/mcp-conf-tui.js`:

```js
const CLIENTS = [
  { name: "cline", message: "Cline" },
  { name: "codex", message: "Codex" },
  { name: "claude-cli", message: "Claude CLI" },
  { name: "claude-desktop", message: "Claude Desktop" },
  { name: "goose", message: "Goose" },
  { name: "cursor", message: "Cursor" },
  { name: "windsurf", message: "Windsurf" },
  { name: "opencode", message: "OpenCode (kilo)" },
  { name: "copilot", message: "GitHub Copilot" },
  { name: "antigravity", message: "Antigravity" },
  { name: "qwen", message: "Qwen" },
  { name: "gemini", message: "Gemini" },
  { name: "crush", message: "Crush" },
];
```

- [ ] **Step 2: Rename `clientName === "claude"` branches**

Grep for all `"claude"` references in `bin/mcp-conf-tui.js`:

```bash
grep -n '"claude"' bin/mcp-conf-tui.js
```

Replace each with `"claude-cli"`. The expected set (based on current code) is line 280 (`if (clientName === "claude")`) and lines 285 (`supportsClaudeGlobalAllProjects(...)` — that helper is Claude-CLI-specific).

After replacement, these branches only fire for `claude-cli`. `claude-desktop` falls through to generic logic below them.

- [ ] **Step 3: Add a `claude-desktop` branch that forces stdio + global**

Read the code around line 280 to see the shape of the existing Claude branch. Add a sibling branch before the existing Claude one, for example:

```js
  if (clientName === "claude-desktop") {
    result.transport = "stdio";
    result.scope = "global";
    // Skip transport picker and scope picker entirely.
  } else if (clientName === "claude-cli") {
    // existing Claude CLI logic, unchanged
    ...
  }
```

Read the full existing function body first and adapt this skeleton to match its exact variable names (`result.scope`, `result.transport`, whatever they actually are). If the TUI builds the transport/scope pickers unconditionally, short-circuit them with `if (clientName !== "claude-desktop")` guards around the picker `await askSelect(...)` calls.

- [ ] **Step 4: Lint**

```bash
npm run lint
```

Expected: pass.

- [ ] **Step 5: Manual verify**

```bash
node bin/mcp-conf.js tui
```

- Pick `Claude CLI` — expect the existing behavior (scope picker, project/global mode).
- Restart and pick `Claude Desktop` — expect no scope picker, no transport picker; add/update flows go straight to `--mcp / --env / --env-path / --session-env`.
- Do not commit any test entries created by the TUI; clean them up via `rm`.

- [ ] **Step 6: Commit**

```bash
git add bin/mcp-conf-tui.js
git commit -m "feat(tui): rename Claude to Claude CLI; add Claude Desktop entry"
```

---

## Task 8: Help text, README, CHANGELOG, version bump

**Goal:** Make the distinction visible in every user-facing place. Ship as `0.3.0`.

**Files:**
- Modify: `bin/mcp-conf.js` — help text at lines 1877-1985 (client enumerations).
- Modify: `README.md` — add a "Claude: CLI vs Desktop vs Connectors" note.
- Modify: `CHANGELOG.md` — new `[0.3.0]` section.
- Modify: `package.json` — bump version.

- [ ] **Step 1: Update every `--client <name>` help enumeration**

In `bin/mcp-conf.js`, search for `cline | codex | claude |`:

```bash
grep -n 'cline | codex | claude |' bin/mcp-conf.js
```

Replace each occurrence (should be ~6 spots for add/rm/ls/show/enable/disable/where/update) with:

```
cline | codex | claude-cli | claude-desktop | goose | cursor | windsurf | opencode | kilo | copilot | antigravity | qwen | gemini | crush (repeatable)
```

Also find the top-level "Clients" block in the help output — look for a heading like "Supported clients" or a `CLIENTS` constant used to print help. Add a one-line note: `  claude             alias of claude-cli (Claude Code CLI)`. If no such dedicated block exists, add this note once near the end of the help output so the alias is discoverable.

- [ ] **Step 2: README — add the distinction note**

Read the current `README.md` structure, then add a subsection right after the first code example block that shows `--client claude`. Suggested title: `### Claude: CLI vs Desktop vs Connectors`. Contents:

```markdown
### Claude: CLI vs Desktop vs Connectors

Anthropic ships several "Claude" products. `mcp-conf` configures MCP servers for two of them:

- `--client claude-cli` (alias: `--client claude`) — **Claude Code CLI**. Writes to `~/.claude.json` (global) or `./.mcp.json` (local). Supports stdio / http / sse. No restart needed.
- `--client claude-desktop` — **Claude Desktop GUI** (macOS / Windows). Writes to `claude_desktop_config.json`. Supports **stdio only**. You must restart Claude Desktop after changes. Linux is not officially supported by Anthropic.
- **claude.ai Custom Connectors** (web UI) — cloud-side remote MCP, HTTPS only. **No public API**; add them manually via Settings → Connectors. `mcp-conf` cannot touch these.
```

- [ ] **Step 3: CHANGELOG — add `[0.3.0]` section**

Insert directly under `## [Unreleased]` (`CHANGELOG.md:3`):

```markdown
## [0.3.0] - 2026-04-20
### Added
- `--client claude-desktop` — Claude Desktop GUI config support (macOS, Windows) for `add`, `rm`, `ls`, `show`, `enable`, `disable`, `where`, and `update`. Writes stdio entries to `claude_desktop_config.json`. Prints a restart reminder after every mutation.
- README: "Claude: CLI vs Desktop vs Connectors" note clarifying which Claude product `mcp-conf` targets.

### Changed
- `--client claude` is now a permanent alias for `--client claude-cli`. The canonical id in help text is `claude-cli`; existing scripts using `claude` continue to work.
- TUI client picker: entry "Claude" renamed to "Claude CLI"; new entry "Claude Desktop" added.

### Notes
- Claude Desktop does **not** support remote MCP (HTTP/SSE) in `claude_desktop_config.json`; remote Custom Connectors must be added through Claude Desktop's Settings → Connectors UI. There is no public API for this, so `mcp-conf` cannot automate it.
- Claude Desktop is not officially available on Linux; `--client claude-desktop` fails with a clear error there.
```

- [ ] **Step 4: Bump version**

Edit `package.json`:

```json
  "version": "0.3.0",
```

- [ ] **Step 5: Lint**

```bash
npm run lint
```

Expected: pass.

- [ ] **Step 6: Regression smoke**

```bash
node bin/mcp-conf.js help | head -40
node bin/mcp-conf.js add --client claude --name abap-smoke --mcp TRIAL --global --force
node bin/mcp-conf.js ls --client claude --global | grep abap-smoke
node bin/mcp-conf.js rm --client claude --name abap-smoke --global
```

Expected: help text lists `claude-cli | claude-desktop` in the `--client` line and mentions `claude` as alias; all three CLI invocations succeed (alias still works end-to-end).

- [ ] **Step 7: Commit**

```bash
git add bin/mcp-conf.js README.md CHANGELOG.md package.json
git commit -m "feat: release 0.3.0 — claude-desktop client and claude-cli rename"
```

---

## Final verification checklist

After all tasks are complete, run once:

```bash
npm run lint
```

And re-run the full spec verification list from
`docs/superpowers/specs/2026-04-20-claude-desktop-client-design.md` → "Verification" section.
Confirm each item behaves as specified.
