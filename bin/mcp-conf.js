#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

let yaml;
try {
  // Optional dependency already in package.json
  // eslint-disable-next-line import/no-extraneous-dependencies
  yaml = require("yaml");
} catch {
  yaml = null;
}

let toml;
try {
  // eslint-disable-next-line import/no-extraneous-dependencies
  toml = require("@iarna/toml");
} catch {
  toml = null;
}

const args = process.argv.slice(2);
const action = args[0] && !args[0].startsWith("-") ? args[0] : null;
if (action && ["add", "rm", "ls", "enable", "disable", "where", "tui", "help"].includes(action)) {
  args.shift();
}
const options = {
  clients: [],
  envPath: null,
  useSessionEnv: false,
  mcpDestination: null,
  name: null,
  transport: "stdio",
  command: "mcp-abap-adt",
  scope: null,
  dryRun: false,
  force: false,
  disabled: false,
  toggle: false,
  remove: false,
  list: false,
  allProjects: false,
  projectPath: null,
  where: false,
  url: null,
  headers: {},
  timeout: 60,
};

if (args.includes("--help") || args.includes("-h") || action === "help") {
  const helpAction =
    action === "help"
      ? args[0]
      : action && ["add", "rm", "ls", "enable", "disable", "where", "tui"].includes(action)
        ? action
        : null;
  printHelp(helpAction);
  process.exit(0);
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--client") {
    options.clients.push(normalizeClientName(args[i + 1]));
    i += 1;
  } else if (arg === "--env") {
    const maybePath = args[i + 1];
    if (maybePath && !maybePath.startsWith("-")) {
      // Backward-compatible form: --env /path/to/.env
      options.envPath = maybePath;
      options.useSessionEnv = false;
      options.mcpDestination = null;
      i += 1;
    } else {
      options.useSessionEnv = true;
      options.envPath = null;
      options.mcpDestination = null;
    }
  } else if (arg === "--env-path") {
    options.envPath = args[i + 1];
    options.useSessionEnv = false;
    options.mcpDestination = null;
    i += 1;
  } else if (arg === "--session-env") {
    options.useSessionEnv = true;
    options.envPath = null;
    options.mcpDestination = null;
  } else if (arg === "--mcp") {
    options.mcpDestination = args[i + 1];
    options.useSessionEnv = false;
    options.envPath = null;
    i += 1;
  } else if (arg === "--name") {
    options.name = args[i + 1];
    i += 1;
  } else if (arg === "--transport") {
    options.transport = args[i + 1];
    i += 1;
  } else if (arg === "--command") {
    options.command = args[i + 1];
    i += 1;
  } else if (arg === "--global") {
    if (options.scope && options.scope !== "global") {
      fail("Choose either --global or --local (not both).");
    }
    options.scope = "global";
  } else if (arg === "--local") {
    if (options.scope && options.scope !== "local") {
      fail("Choose either --global or --local (not both).");
    }
    options.scope = "local";
  } else if (arg === "--all-projects") {
    options.allProjects = true;
  } else if (arg === "--project") {
    options.projectPath = args[i + 1];
    i += 1;
  } else if (arg === "--url") {
    options.url = args[i + 1];
    i += 1;
  } else if (arg === "--header") {
    const [key, ...rest] = (args[i + 1] || "").split("=");
    if (!key || rest.length === 0) {
      fail("Header must be in key=value format.");
    }
    options.headers[key] = rest.join("=");
    i += 1;
  } else if (arg === "--timeout") {
    options.timeout = Number(args[i + 1]);
    i += 1;
  } else if (arg === "--disable") {
    options.disabled = true;
    options.toggle = true;
  } else if (arg === "--enable") {
    options.disabled = false;
    options.toggle = true;
  } else if (arg === "--remove") {
    options.remove = true;
  } else if (arg === "--dry-run") {
    options.dryRun = true;
  } else if (arg === "--force") {
    options.force = true;
  }
}

if (!action || !["add", "rm", "ls", "enable", "disable", "where", "tui"].includes(action)) {
  fail("Provide a command: add | rm | ls | enable | disable | where | tui.");
}

let effectiveAction = action;
if (action === "tui") {
  runTuiWizard(options);
  effectiveAction = options.tuiAction || "add";
}

if (options.clients.length === 0) {
  fail("Provide at least one --client.");
}

if (!["ls"].includes(effectiveAction) && !options.name) {
  fail("Provide --name <serverName> (required).");
}

const transportNormalized = options.transport === "http" ? "streamableHttp" : options.transport;
options.transport = transportNormalized;

if (effectiveAction === "rm") {
  options.remove = true;
}
if (effectiveAction === "ls") {
  options.list = true;
}
if (effectiveAction === "enable") {
  options.toggle = true;
  options.disabled = false;
}
if (effectiveAction === "disable") {
  options.toggle = true;
  options.disabled = true;
}
if (effectiveAction === "where") {
  options.where = true;
}

if (options.remove && effectiveAction !== "rm") {
  fail("Use the rm command instead of --remove.");
}
if (options.list && options.toggle) {
  fail("The ls command does not support --enable/--disable.");
}
if (options.remove && options.toggle) {
  fail("The rm command does not support --enable/--disable.");
}
if (options.allProjects && !options.list && !options.toggle && !options.remove && !options.where) {
  fail("--all-projects is only supported for rm/enable/disable/ls/where.");
}
if (options.projectPath && options.allProjects) {
  fail("Use either --project or --all-projects (not both).");
}
if (options.where && (options.list || options.remove || options.toggle)) {
  fail("The where command does not support ls/rm/enable/disable flags.");
}
if (options.projectPath && effectiveAction === "add" && options.scope !== "global") {
  fail("--project is only supported for Claude global config.");
}

const requiresConnectionParams =
  !options.remove && !options.toggle && !options.list && !options.where;

if (requiresConnectionParams && options.transport === "stdio") {
  if (!options.envPath && !options.mcpDestination && !options.useSessionEnv) {
    fail("Provide --env, --env-path <path>, or --mcp <destination>.");
  }
}

if (requiresConnectionParams && options.transport !== "stdio") {
  if (!options.url) {
    fail("Provide --url <http(s)://...> for sse/http transports.");
  }
  if (options.envPath || options.mcpDestination || options.useSessionEnv) {
    fail("--env/--env-path/--mcp are only valid for stdio transport.");
  }
}

const platform = os.platform();
const home = os.homedir();
const appData = process.env.APPDATA || home;
const userProfile = process.env.USERPROFILE || home;

const serverArgsRaw = [
  `--transport=${options.transport}`,
  options.useSessionEnv
    ? "--env"
    : options.envPath
      ? `--env-path=${options.envPath}`
      : options.mcpDestination
        ? `--mcp=${options.mcpDestination.toLowerCase()}`
        : undefined,
];
const serverArgs = serverArgsRaw.filter(Boolean);

for (const client of options.clients) {
  const scope = options.scope || getDefaultScope(client);
  if (options.projectPath && client !== "claude") {
    fail("--project is only supported for Claude.");
  }
  switch (client) {
    case "cline":
      requireScope("Cline", ["global"], scope);
      if (options.list) {
        listJsonConfig(getClinePath(platform, home, appData), "cline");
      } else if (options.where) {
        whereJsonConfig(getClinePath(platform, home, appData), "cline", options.name);
      } else {
        writeJsonConfig(getClinePath(platform, home, appData), options.name, serverArgs, "cline");
      }
      break;
    case "codex":
      if (options.transport === "sse") {
        fail("Codex does not support SSE transport.");
      }
      requireScope("Codex", ["global", "local"], scope);
      if (options.list) {
        listCodexConfig(getCodexPath(platform, home, userProfile, scope));
      } else if (options.where) {
        whereCodexConfig(getCodexPath(platform, home, userProfile, scope), options.name);
      } else {
        writeCodexConfig(
          getCodexPath(platform, home, userProfile, scope),
          options.name,
          serverArgs,
        );
      }
      break;
    case "claude": {
      requireScope("Claude", ["global", "local"], scope);
      const claudeToggleScope = options.toggle ? "global" : scope;
      if (options.allProjects && claudeToggleScope !== "global") {
        fail("--all-projects is only supported for Claude global config.");
      }
      if (options.projectPath && claudeToggleScope !== "global") {
        fail("--project is only supported for Claude global config.");
      }
      if (options.toggle && scope === "local") {
        const localPath = getClaudePath(platform, home, appData, "local");
        if (!claudeLocalHasServer(localPath, options.name)) {
          fail(`Server "${options.name}" not found in ${localPath}.`);
        }
      }
      if (options.list) {
        listClaudeConfig(
          getClaudePath(platform, home, appData, claudeToggleScope),
          options.allProjects,
          options.projectPath,
        );
      } else if (options.where) {
        whereClaudeConfig(
          getClaudePath(platform, home, appData, claudeToggleScope),
          options.name,
          options.allProjects,
          options.projectPath,
        );
      } else {
        writeClaudeConfig(
          getClaudePath(platform, home, appData, claudeToggleScope),
          options.name,
          serverArgs,
        );
      }
      break;
    }
    case "goose":
      requireScope("Goose", ["global"], scope);
      if (options.list) {
        listGooseConfig(getGoosePath(platform, home, appData));
      } else if (options.where) {
        whereGooseConfig(getGoosePath(platform, home, appData), options.name);
      } else {
        writeGooseConfig(getGoosePath(platform, home, appData), options.name, serverArgs);
      }
      break;
    case "opencode":
      requireScope("OpenCode", ["global", "local"], scope);
      if (options.list) {
        listJsonConfig(getOpenCodePath(platform, home, appData, scope), "opencode");
      } else if (options.where) {
        whereJsonConfig(getOpenCodePath(platform, home, appData, scope), "opencode", options.name);
      } else {
        writeJsonConfig(
          getOpenCodePath(platform, home, appData, scope),
          options.name,
          serverArgs,
          "opencode",
        );
      }
      break;
    case "antigravity":
      requireScope("Antigravity", ["global", "local"], scope);
      if (scope === "local") {
        process.stdout.write("Antigravity local scope is not supported yet.\n");
        break;
      }
      if (options.list) {
        listJsonConfig(getAntigravityPath(home, scope), "antigravity");
      } else if (options.where) {
        whereJsonConfig(getAntigravityPath(home, scope), "antigravity", options.name);
      } else {
        writeJsonConfig(getAntigravityPath(home, scope), options.name, serverArgs, "antigravity");
      }
      break;
    case "copilot":
      requireScope("GitHub Copilot", ["local"], scope);
      if (options.list) {
        listJsonConfig(getCopilotPath(), "copilot");
      } else if (options.where) {
        whereJsonConfig(getCopilotPath(), "copilot", options.name);
      } else {
        writeJsonConfig(getCopilotPath(), options.name, serverArgs, "copilot");
      }
      break;
    case "cursor":
      requireScope("Cursor", ["global", "local"], scope);
      if (options.list) {
        listJsonConfig(getCursorPath(platform, home, userProfile, scope), "cursor");
      } else if (options.where) {
        whereJsonConfig(getCursorPath(platform, home, userProfile, scope), "cursor", options.name);
      } else {
        writeJsonConfig(
          getCursorPath(platform, home, userProfile, scope),
          options.name,
          serverArgs,
          "cursor",
        );
      }
      break;
    case "windsurf":
      requireScope("Windsurf", ["global"], scope);
      if (options.list) {
        listJsonConfig(getWindsurfPath(platform, home, userProfile), "windsurf");
      } else if (options.where) {
        whereJsonConfig(getWindsurfPath(platform, home, userProfile), "windsurf", options.name);
      } else {
        writeJsonConfig(
          getWindsurfPath(platform, home, userProfile),
          options.name,
          serverArgs,
          "windsurf",
        );
      }
      break;
    default:
      fail(`Unknown client: ${client}`);
  }
}

function normalizeClientName(clientName) {
  if (!clientName) {
    return clientName;
  }
  const normalized = clientName.toLowerCase();
  return normalized === "kilo" ? "opencode" : normalized;
}

function runTuiWizard(opts) {
  if (!process.stdin.isTTY) {
    fail("TUI mode requires an interactive terminal.");
  }
  process.stdout.write("mcp-conf tui\n");
  process.stdout.write("Interactive MCP setup wizard\n\n");
  process.stdout.write("Type q to exit at any step.\n\n");

  opts.tuiAction = promptChoice("Select operation:", [
    { label: "add", value: "add" },
    { label: "ls", value: "ls" },
    { label: "rm", value: "rm" },
    { label: "enable", value: "enable" },
    { label: "disable", value: "disable" },
  ]);

  const clientChoice = promptChoice("Select client:", [
    { label: "cline", value: "cline" },
    { label: "codex", value: "codex" },
    { label: "claude", value: "claude" },
    { label: "goose", value: "goose" },
    { label: "cursor", value: "cursor" },
    { label: "windsurf", value: "windsurf" },
    { label: "opencode (kilo)", value: "opencode" },
    { label: "copilot", value: "copilot" },
    { label: "antigravity", value: "antigravity" },
  ]);
  opts.clients = [clientChoice];

  const allowedScopes = getSupportedScopes(clientChoice);
  opts.scope =
    allowedScopes.length === 1
      ? allowedScopes[0]
      : promptChoice("Select scope:", [
          { label: "global", value: "global" },
          { label: "local", value: "local" },
        ]);
  if (!allowedScopes.includes(opts.scope)) {
    opts.scope = promptChoice(
      `${clientChoice} supports ${allowedScopes.join("/")} scope. Select supported scope:`,
      allowedScopes.map((scopeName) => ({ label: scopeName, value: scopeName })),
    );
  }

  if (opts.tuiAction !== "ls") {
    opts.name = promptLine("Server name [abap]: ", "abap");
  } else {
    opts.name = null;
  }
  opts.headers = {};

  if (opts.tuiAction !== "add") {
    return;
  }

  const transports = getSupportedTransports(clientChoice);
  opts.transport =
    transports.length > 1
      ? promptChoice(
          "Select transport:",
          transports.map((transportName) => ({ label: transportName, value: transportName })),
        )
      : transports[0];

  if (opts.transport === "stdio") {
    const authSource = promptChoice("Auth source for stdio:", [
      { label: "service key destination (--mcp)", value: "mcp" },
      { label: "session environment (--env)", value: "session" },
      { label: "specific env file (--env-path)", value: "env" },
    ]);
    if (authSource === "mcp") {
      opts.mcpDestination = promptLine("Destination name (e.g. TRIAL): ");
      opts.envPath = null;
      opts.useSessionEnv = false;
    } else if (authSource === "env") {
      opts.envPath = promptLine("Path to .env file: ");
      opts.mcpDestination = null;
      opts.useSessionEnv = false;
    } else {
      opts.useSessionEnv = true;
      opts.envPath = null;
      opts.mcpDestination = null;
    }
    opts.url = null;
  } else {
    opts.url = promptLine("Server URL (http/https): ");
    opts.timeout = promptNumber("Timeout seconds [60]: ", 60);
    opts.headers = promptHeaders();
    opts.envPath = null;
    opts.mcpDestination = null;
    opts.useSessionEnv = false;
  }
}

function getSupportedScopes(clientName) {
  if (clientName === "copilot") {
    return ["local"];
  }
  if (["cline", "goose", "windsurf", "antigravity"].includes(clientName)) {
    return ["global"];
  }
  return ["global", "local"];
}

function getSupportedTransports(clientName) {
  if (clientName === "codex") {
    return ["stdio", "http"];
  }
  return ["stdio", "sse", "http"];
}

function promptHeaders() {
  const headers = {};
  const headerChoices = [
    { label: "x-mcp-destination", value: "x-mcp-destination" },
    { label: "x-sap-url", value: "x-sap-url" },
    { label: "x-sap-client", value: "x-sap-client" },
    { label: "x-sap-auth-type", value: "x-sap-auth-type" },
    { label: "x-sap-jwt-token", value: "x-sap-jwt-token" },
    { label: "x-sap-user", value: "x-sap-user" },
    { label: "x-sap-password", value: "x-sap-password" },
    { label: "Done", value: null },
  ];

  while (true) {
    const key = promptChoice("Select header to add:", headerChoices);
    if (!key) {
      return headers;
    }
    const value = promptLine(`Value for ${key}: `);
    headers[key] = value;

    const addMore = promptChoice("Add another header?", [
      { label: "yes", value: true },
      { label: "no", value: false },
    ]);
    if (!addMore) {
      return headers;
    }
  }
}

function promptNumber(question, defaultValue) {
  while (true) {
    const raw = promptLine(question, String(defaultValue));
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    process.stdout.write("Please provide a positive number.\n");
  }
}

function promptChoice(label, entries) {
  process.stdout.write(`${label}\n`);
  for (let i = 0; i < entries.length; i += 1) {
    process.stdout.write(`  ${i + 1}. ${entries[i].label}\n`);
  }
  while (true) {
    const answer = promptLine("Choose number: ");
    if (isExitAnswer(answer)) {
      exitTui();
    }
    const idx = Number.parseInt(answer, 10);
    if (Number.isInteger(idx) && idx >= 1 && idx <= entries.length) {
      process.stdout.write("\n");
      return entries[idx - 1].value;
    }
    process.stdout.write("Invalid choice. Try again.\n");
  }
}

function promptLine(question, defaultValue) {
  process.stdout.write(question);
  const buffer = Buffer.alloc(1024);
  let chunk = "";
  while (true) {
    let bytesRead;
    try {
      bytesRead = fs.readSync(0, buffer, 0, buffer.length, null);
    } catch (error) {
      if (error && (error.code === "EAGAIN" || error.code === "EINTR")) {
        sleepMs(10);
        continue;
      }
      throw error;
    }
    if (bytesRead <= 0) {
      break;
    }
    chunk += buffer.toString("utf8", 0, bytesRead);
    if (chunk.includes("\n")) {
      break;
    }
  }
  const firstLine = chunk.split(/\r?\n/u)[0].trim();
  if (isExitAnswer(firstLine)) {
    exitTui();
  }
  if (!firstLine && defaultValue !== undefined) {
    return defaultValue;
  }
  if (!firstLine) {
    process.stdout.write("Value is required.\n");
    return promptLine(question, defaultValue);
  }
  return firstLine;
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isExitAnswer(value) {
  return ["q", "quit", "exit"].includes((value || "").toLowerCase());
}

function exitTui() {
  process.stdout.write("\nTUI cancelled.\n");
  process.exit(0);
}

function getClinePath(platformValue, homeDir, appDataDir) {
  if (platformValue === "win32") {
    return path.join(
      appDataDir,
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings",
      "cline_mcp_settings.json",
    );
  }
  return path.join(
    homeDir,
    ".config",
    "Code",
    "User",
    "globalStorage",
    "saoudrizwan.claude-dev",
    "settings",
    "cline_mcp_settings.json",
  );
}

function getCodexPath(platformValue, homeDir, userProfileDir, scopeValue) {
  if (scopeValue === "local") {
    return path.join(process.cwd(), ".codex", "config.toml");
  }
  if (platformValue === "win32") {
    return path.join(userProfileDir, ".codex", "config.toml");
  }
  return path.join(homeDir, ".codex", "config.toml");
}

function getClaudePath(platformValue, homeDir, appDataDir, scopeValue) {
  if (scopeValue === "local") {
    return path.join(process.cwd(), ".mcp.json");
  }
  if (platformValue === "darwin") {
    return path.join(
      homeDir,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  if (platformValue === "win32") {
    return path.join(appDataDir, "Claude", "claude_desktop_config.json");
  }
  return path.join(homeDir, ".claude.json");
}

function getGoosePath(platformValue, homeDir, appDataDir) {
  if (platformValue === "win32") {
    return path.join(appDataDir, "Block", "goose", "config", "config.yaml");
  }
  return path.join(homeDir, ".config", "goose", "config.yaml");
}

function getCursorPath(platformValue, homeDir, userProfileDir, scopeValue) {
  if (scopeValue === "local") {
    return path.join(process.cwd(), ".cursor", "mcp.json");
  }
  const base = platformValue === "win32" ? userProfileDir : homeDir;
  return path.join(base, ".cursor", "mcp.json");
}

function getCopilotPath() {
  return path.join(process.cwd(), ".vscode", "mcp.json");
}

function getOpenCodePath(platformValue, homeDir, appDataDir, scopeValue) {
  if (scopeValue === "local") {
    return path.join(process.cwd(), "opencode.json");
  }
  if (platformValue === "win32") {
    return path.join(appDataDir, "opencode", "opencode.json");
  }
  return path.join(homeDir, ".config", "opencode", "opencode.json");
}

function getAntigravityPath(homeDir, scopeValue) {
  if (scopeValue === "local") {
    return path.join(process.cwd(), ".antigravity", "mcp.json");
  }
  return path.join(homeDir, ".gemini", "antigravity", "mcp_config.json");
}

function getWindsurfPath(platformValue, homeDir, userProfileDir) {
  if (platformValue === "win32") {
    return path.join(userProfileDir, ".codeium", "windsurf", "mcp_config.json");
  }
  return path.join(homeDir, ".codeium", "windsurf", "mcp_config.json");
}

function requireScope(clientLabel, allowedScopes, requestedScope) {
  if (!allowedScopes.includes(requestedScope)) {
    fail(
      `${clientLabel} supports ${allowedScopes.join("/")} configuration only. ` +
        `Use --${allowedScopes[0]}.`,
    );
  }
}

function getDefaultScope(clientType) {
  if (clientType === "copilot") {
    return "local";
  }
  return "global";
}

function resolveProjectSelector(data, projectPath) {
  if (!projectPath) {
    return resolveClaudeProjectKey(data);
  }
  if (!data.projects) {
    return projectPath;
  }
  if (data.projects[projectPath]) {
    return projectPath;
  }
  let desiredReal;
  try {
    desiredReal = fs.realpathSync(projectPath);
  } catch {
    return projectPath;
  }
  for (const key of Object.keys(data.projects)) {
    try {
      if (fs.realpathSync(key) === desiredReal) {
        return key;
      }
    } catch {
      // ignore invalid paths
    }
  }
  return projectPath;
}

function getDefaultDisabled(clientType) {
  return ["cline", "codex", "windsurf", "goose", "claude", "opencode"].includes(clientType);
}

function writeJsonConfig(filePath, serverName, argsArray, clientType) {
  ensureDir(filePath);
  const data = readJson(filePath);
  if (clientType === "opencode") {
    data.mcp = data.mcp || {};
  } else if (clientType === "antigravity") {
    data.mcpServers = data.mcpServers || {};
  } else if (clientType === "copilot") {
    data.servers = data.servers || {};
    data.inputs = data.inputs || [];
  } else {
    data.mcpServers = data.mcpServers || {};
  }
  if (options.toggle) {
    if (clientType === "cursor" || clientType === "copilot") {
      fail(
        `${clientType === "cursor" ? "Cursor" : "GitHub Copilot"} enable/disable is not implemented yet.`,
      );
    }
    const store =
      clientType === "opencode"
        ? data.mcp
        : clientType === "copilot"
          ? data.servers
          : data.mcpServers;
    if (!store[serverName]) {
      fail(`Server "${serverName}" not found in ${filePath}.`);
    }
    store[serverName] = {
      ...store[serverName],
    };
    if (clientType === "opencode") {
      store[serverName].enabled = !options.disabled;
    } else if (clientType === "antigravity") {
      store[serverName].disabled = !!options.disabled;
    } else {
      store[serverName].disabled = !!options.disabled;
    }
    writeFile(filePath, JSON.stringify(data, null, 2));
    return;
  }
  if (options.remove) {
    const store =
      clientType === "opencode"
        ? data.mcp
        : clientType === "copilot"
          ? data.servers
          : data.mcpServers;
    if (!store[serverName]) {
      fail(`Server "${serverName}" not found in ${filePath}.`);
    }
    delete store[serverName];
    writeFile(filePath, JSON.stringify(data, null, 2));
    return;
  }
  const store =
    clientType === "opencode"
      ? data.mcp
      : clientType === "copilot"
        ? data.servers
        : data.mcpServers;
  if (store[serverName] && !options.force) {
    fail(`Server "${serverName}" already exists in ${filePath}. Use --force to overwrite.`);
  }
  if (clientType === "opencode") {
    const enabled = options.disabled ? false : !getDefaultDisabled("opencode");
    if (options.transport === "stdio") {
      store[serverName] = {
        type: "local",
        command: options.command,
        args: argsArray,
        enabled,
      };
    } else {
      store[serverName] = {
        type: "remote",
        url: options.url,
        enabled,
      };
    }
    writeFile(filePath, JSON.stringify(data, null, 2));
    return;
  }
  if (clientType === "copilot") {
    if (options.transport === "stdio") {
      store[serverName] = {
        type: "stdio",
        command: options.command,
        args: argsArray,
      };
    } else {
      const entry = {
        type: options.transport === "streamableHttp" ? "http" : options.transport,
        url: options.url,
      };
      if (Object.keys(options.headers).length > 0) {
        entry.headers = options.headers;
      }
      store[serverName] = entry;
    }
    writeFile(filePath, JSON.stringify(data, null, 2));
    return;
  }
  if (clientType === "antigravity") {
    if (options.transport === "stdio") {
      store[serverName] = {
        command: options.command,
        args: argsArray,
        timeout: options.timeout,
        disabled: !!options.disabled,
      };
    } else {
      const entry = {
        type: "http",
        serverUrl: options.url,
        timeout: options.timeout,
        disabled: !!options.disabled,
      };
      if (Object.keys(options.headers).length > 0) {
        entry.headers = options.headers;
      }
      store[serverName] = entry;
    }
    writeFile(filePath, JSON.stringify(data, null, 2));
    return;
  }
  if (options.transport === "stdio") {
    data.mcpServers[serverName] = {
      command: options.command,
      args: argsArray,
      timeout: options.timeout,
    };
    data.mcpServers[serverName].disabled = !!(options.disabled || getDefaultDisabled(clientType));
  } else {
    const entry = {
      type: options.transport,
      url: options.url,
      timeout: options.timeout,
    };
    if (Object.keys(options.headers).length > 0) {
      entry.headers = options.headers;
    }
    const defaultDisabled = getDefaultDisabled(clientType);
    entry.disabled = !!(options.disabled || defaultDisabled);
    data.mcpServers[serverName] = entry;
  }
  writeFile(filePath, JSON.stringify(data, null, 2));
}

function writeClaudeConfig(filePath, serverName, argsArray) {
  ensureDir(filePath);
  const data = readJson(filePath);
  const isDesktopConfig =
    filePath.endsWith(".claude.json") || filePath.endsWith("claude_desktop_config.json");
  const resolveProjectKey = () => resolveProjectSelector(data, options.projectPath);
  const updateClaudeMcpLists = (projectNode) => {
    projectNode.enabledMcpServers = projectNode.enabledMcpServers || [];
    projectNode.disabledMcpServers = projectNode.disabledMcpServers || [];
    if (projectNode.enabledMcpjsonServers?.length) {
      for (const name of projectNode.enabledMcpjsonServers) {
        if (!projectNode.enabledMcpServers.includes(name)) {
          projectNode.enabledMcpServers.push(name);
        }
      }
    }
    if (projectNode.disabledMcpjsonServers?.length) {
      for (const name of projectNode.disabledMcpjsonServers) {
        if (!projectNode.disabledMcpServers.includes(name)) {
          projectNode.disabledMcpServers.push(name);
        }
      }
    }
    const enabled = projectNode.enabledMcpServers;
    const disabled = projectNode.disabledMcpServers;
    const shouldDisable = options.toggle
      ? options.disabled
      : options.disabled || getDefaultDisabled("claude");
    const removeFrom = (list) => {
      const idx = list.indexOf(serverName);
      if (idx >= 0) {
        list.splice(idx, 1);
      }
    };
    if (shouldDisable) {
      removeFrom(enabled);
      if (!disabled.includes(serverName)) {
        disabled.push(serverName);
      }
    } else {
      removeFrom(disabled);
      if (!enabled.includes(serverName)) {
        enabled.push(serverName);
      }
    }
  };
  if (options.remove) {
    if (isDesktopConfig) {
      if (options.allProjects) {
        const projects = Object.keys(data.projects || {});
        let removed = false;
        for (const key of projects) {
          if (data.projects?.[key]?.mcpServers?.[serverName]) {
            delete data.projects[key].mcpServers[serverName];
            const projectNode = data.projects[key];
            projectNode.enabledMcpServers =
              projectNode.enabledMcpServers?.filter((name) => name !== serverName) || [];
            projectNode.disabledMcpServers =
              projectNode.disabledMcpServers?.filter((name) => name !== serverName) || [];
            removed = true;
          }
        }
        if (!removed) {
          fail(`Server "${serverName}" not found in any Claude projects.`);
        }
      } else {
        const projectKey = resolveProjectKey();
        if (!data.projects?.[projectKey]?.mcpServers?.[serverName]) {
          fail(`Server "${serverName}" not found for ${projectKey}.`);
        }
        delete data.projects[projectKey].mcpServers[serverName];
        const projectNode = data.projects[projectKey];
        projectNode.enabledMcpServers =
          projectNode.enabledMcpServers?.filter((name) => name !== serverName) || [];
        projectNode.disabledMcpServers =
          projectNode.disabledMcpServers?.filter((name) => name !== serverName) || [];
      }
    } else {
      data.mcpServers = data.mcpServers || {};
      if (!data.mcpServers[serverName]) {
        fail(`Server "${serverName}" not found in ${filePath}.`);
      }
      delete data.mcpServers[serverName];
    }
    writeFile(filePath, JSON.stringify(data, null, 2));
    return;
  }
  if (options.toggle && !isDesktopConfig) {
    fail("Claude enable/disable requires the main Claude config file.");
  }
  if (isDesktopConfig) {
    data.projects = data.projects || {};
    if (options.toggle) {
      if (options.allProjects) {
        const projects = Object.keys(data.projects || {});
        let toggled = false;
        for (const key of projects) {
          if (!data.projects[key]) {
            continue;
          }
          data.projects[key].mcpServers = data.projects[key].mcpServers || {};
          if (!data.projects[key].mcpServers[serverName]) {
            continue;
          }
          updateClaudeMcpLists(data.projects[key]);
          toggled = true;
        }
        if (!toggled) {
          fail(`Server "${serverName}" not found in any Claude projects.`);
        }
        writeFile(filePath, JSON.stringify(data, null, 2));
        return;
      }
      const projectKey = resolveProjectKey();
      if (!data.projects[projectKey]) {
        data.projects[projectKey] = {
          allowedTools: [],
          mcpContextUris: [],
          mcpServers: {},
          enabledMcpServers: [],
          disabledMcpServers: [],
        };
      }
      data.projects[projectKey].mcpServers = data.projects[projectKey].mcpServers || {};
      updateClaudeMcpLists(data.projects[projectKey]);
      writeFile(filePath, JSON.stringify(data, null, 2));
      return;
    }
    const projectKey = resolveProjectKey();
    if (!data.projects[projectKey]) {
      data.projects[projectKey] = {
        allowedTools: [],
        mcpContextUris: [],
        mcpServers: {},
        enabledMcpServers: [],
        disabledMcpServers: [],
      };
    }
    data.projects[projectKey].enabledMcpServers = data.projects[projectKey].enabledMcpServers || [];
    data.projects[projectKey].disabledMcpServers =
      data.projects[projectKey].disabledMcpServers || [];
    data.projects[projectKey].mcpServers = data.projects[projectKey].mcpServers || {};
    if (data.projects[projectKey].mcpServers[serverName] && !options.force) {
      fail(`Server "${serverName}" already exists for ${projectKey}. Use --force to overwrite.`);
    }
    if (options.transport === "stdio") {
      data.projects[projectKey].mcpServers[serverName] = {
        type: "stdio",
        command: options.command,
        args: argsArray,
        timeout: options.timeout,
        env: {},
      };
    } else {
      const entry = {
        type: options.transport === "streamableHttp" ? "http" : options.transport,
        url: options.url,
        timeout: options.timeout,
      };
      if (Object.keys(options.headers).length > 0) {
        entry.headers = options.headers;
      }
      data.projects[projectKey].mcpServers[serverName] = entry;
    }
    updateClaudeMcpLists(data.projects[projectKey]);
  } else {
    data.mcpServers = data.mcpServers || {};
    if (data.mcpServers[serverName] && !options.force) {
      fail(`Server "${serverName}" already exists in ${filePath}. Use --force to overwrite.`);
    }
    if (options.transport === "stdio") {
      data.mcpServers[serverName] = {
        command: options.command,
        args: argsArray,
        timeout: options.timeout,
      };
    } else {
      const entry = {
        type: options.transport === "streamableHttp" ? "http" : options.transport,
        url: options.url,
        timeout: options.timeout,
      };
      if (Object.keys(options.headers).length > 0) {
        entry.headers = options.headers;
      }
      data.mcpServers[serverName] = entry;
    }
  }
  writeFile(filePath, JSON.stringify(data, null, 2));
}

function resolveClaudeProjectKey(data, projectPath = process.cwd()) {
  const desired = projectPath;
  if (!data.projects || data.projects[desired]) {
    return desired;
  }
  let desiredReal;
  try {
    desiredReal = fs.realpathSync(desired);
  } catch {
    return desired;
  }
  const keys = Object.keys(data.projects || {});
  for (const key of keys) {
    try {
      if (fs.realpathSync(key) === desiredReal) {
        return key;
      }
    } catch {
      // ignore invalid paths
    }
  }
  return desired;
}

function writeCodexConfig(filePath, serverName, argsArray) {
  ensureDir(filePath);
  if (!toml) {
    fail("TOML dependency not available. Install dependencies and retry.");
  }

  const data = readToml(filePath);
  data.mcp_servers = data.mcp_servers || {};
  const defaultEnabled = !getDefaultDisabled("codex");

  if (options.remove) {
    if (!data.mcp_servers[serverName]) {
      fail(`Server "${serverName}" not found in ${filePath}.`);
    }
    delete data.mcp_servers[serverName];
    writeFile(filePath, toml.stringify(data));
    return;
  }

  if (options.toggle) {
    if (!data.mcp_servers[serverName]) {
      fail(`Server "${serverName}" not found in ${filePath}.`);
    }
    data.mcp_servers[serverName] = {
      ...data.mcp_servers[serverName],
      enabled: !options.disabled,
    };
    writeFile(filePath, toml.stringify(data));
    return;
  }

  if (data.mcp_servers[serverName] && !options.force) {
    fail(`Server "${serverName}" already exists in ${filePath}. Use --force to overwrite.`);
  }

  if (options.transport === "stdio") {
    data.mcp_servers[serverName] = {
      command: options.command,
      args: argsArray,
      startup_timeout_sec: options.timeout,
      enabled: options.disabled ? false : defaultEnabled,
    };
  } else {
    const entry = {
      url: options.url,
      startup_timeout_sec: options.timeout,
      enabled: options.disabled ? false : defaultEnabled,
    };
    if (Object.keys(options.headers).length > 0) {
      entry.http_headers = options.headers;
    }
    data.mcp_servers[serverName] = entry;
  }

  writeFile(filePath, toml.stringify(data));
}

function writeGooseConfig(filePath, serverName, argsArray) {
  if (!yaml) {
    fail("YAML dependency not available. Install dependencies and retry.");
  }
  ensureDir(filePath);
  const data = readYaml(filePath);
  data.extensions = data.extensions || {};
  if (options.toggle) {
    if (!data.extensions[serverName]) {
      fail(`Server "${serverName}" not found in ${filePath}.`);
    }
    data.extensions[serverName] = {
      ...data.extensions[serverName],
      enabled: !options.disabled,
    };
    writeFile(filePath, yaml.stringify(data));
    return;
  }
  if (options.remove) {
    if (!data.extensions[serverName]) {
      fail(`Server "${serverName}" not found in ${filePath}.`);
    }
    delete data.extensions[serverName];
    writeFile(filePath, yaml.stringify(data));
    return;
  }
  if (data.extensions[serverName] && !options.force) {
    fail(`Server "${serverName}" already exists in ${filePath}. Use --force to overwrite.`);
  }
  const enabled = false;
  if (options.transport === "stdio") {
    data.extensions[serverName] = {
      name: "MCP ABAP ADT",
      cmd: options.command,
      args: argsArray,
      type: "stdio",
      enabled,
      timeout: options.timeout,
    };
  } else {
    const gooseType = options.transport === "sse" ? "sse" : "streamable_http";
    const entry = {
      name: serverName,
      description: "Abap ADT MCP",
      type: gooseType,
      uri: options.url,
      enabled,
      timeout: options.timeout,
      envs: {},
      env_keys: [],
      available_tools: [],
      bundled: null,
    };
    if (Object.keys(options.headers).length > 0) {
      entry.headers = options.headers;
    }
    data.extensions[serverName] = entry;
  }
  writeFile(filePath, yaml.stringify(data));
}

function listJsonConfig(filePath, clientType) {
  const data = readJson(filePath);
  let store;
  if (clientType === "opencode") {
    store = data.mcp || {};
  } else if (clientType === "antigravity") {
    store = data.mcpServers || {};
  } else if (clientType === "copilot") {
    store = data.servers || {};
  } else {
    store = data.mcpServers || {};
  }
  outputList(filePath, Object.keys(store));
}

function listCodexConfig(filePath) {
  if (!toml) {
    fail("TOML dependency not available. Install dependencies and retry.");
  }
  const data = readToml(filePath);
  const store = data.mcp_servers || {};
  outputList(filePath, Object.keys(store));
}

function listGooseConfig(filePath) {
  if (!yaml) {
    fail("YAML dependency not available. Install dependencies and retry.");
  }
  const data = readYaml(filePath);
  const store = data.extensions || {};
  outputList(filePath, Object.keys(store));
}

function listClaudeConfig(filePath, allProjects, projectPath) {
  const data = readJson(filePath);
  const isDesktopConfig =
    filePath.endsWith(".claude.json") || filePath.endsWith("claude_desktop_config.json");
  if (isDesktopConfig) {
    const projects = Object.keys(data.projects || {});
    if (allProjects) {
      if (!projects.length) {
        outputList(filePath, [], "no-projects");
        return;
      }
      for (const key of projects.sort()) {
        const projectNode = data.projects?.[key];
        const store = projectNode?.mcpServers || {};
        outputList(filePath, Object.keys(store), key);
      }
      return;
    }
    const projectKey = resolveProjectSelector(data, projectPath);
    const projectNode = data.projects?.[projectKey];
    const store = projectNode?.mcpServers || {};
    outputList(filePath, Object.keys(store), projectKey);
    return;
  }
  const store = data.mcpServers || {};
  outputList(filePath, Object.keys(store));
}

function claudeLocalHasServer(filePath, serverName) {
  const data = readJson(filePath);
  const store = data.mcpServers || {};
  return Boolean(store[serverName]);
}

function whereJsonConfig(filePath, clientType, serverName) {
  const data = readJson(filePath);
  let store;
  if (clientType === "opencode") {
    store = data.mcp || {};
  } else if (clientType === "antigravity") {
    store = data.mcpServers || {};
  } else if (clientType === "copilot") {
    store = data.servers || {};
  } else {
    store = data.mcpServers || {};
  }
  outputWhere(filePath, serverName, Boolean(store[serverName]));
}

function whereCodexConfig(filePath, serverName) {
  if (!toml) {
    fail("TOML dependency not available. Install dependencies and retry.");
  }
  const data = readToml(filePath);
  const store = data.mcp_servers || {};
  outputWhere(filePath, serverName, Boolean(store[serverName]));
}

function whereGooseConfig(filePath, serverName) {
  if (!yaml) {
    fail("YAML dependency not available. Install dependencies and retry.");
  }
  const data = readYaml(filePath);
  const store = data.extensions || {};
  outputWhere(filePath, serverName, Boolean(store[serverName]));
}

function whereClaudeConfig(filePath, serverName, allProjects, projectPath) {
  const data = readJson(filePath);
  const isDesktopConfig =
    filePath.endsWith(".claude.json") || filePath.endsWith("claude_desktop_config.json");
  if (isDesktopConfig) {
    const projects = Object.keys(data.projects || {});
    if (allProjects) {
      if (!projects.length) {
        outputWhere(filePath, serverName, false, "no-projects");
        return;
      }
      let found = false;
      for (const key of projects.sort()) {
        const projectNode = data.projects?.[key];
        const store = projectNode?.mcpServers || {};
        if (store[serverName]) {
          outputWhere(filePath, serverName, true, key);
          found = true;
        }
      }
      if (!found) {
        outputWhere(filePath, serverName, false, "all-projects");
      }
      return;
    }
    const projectKey = resolveProjectSelector(data, projectPath);
    const projectNode = data.projects?.[projectKey];
    const store = projectNode?.mcpServers || {};
    outputWhere(filePath, serverName, Boolean(store[serverName]), projectKey);
    return;
  }
  const store = data.mcpServers || {};
  outputWhere(filePath, serverName, Boolean(store[serverName]));
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    fail(`Invalid JSON: ${filePath}`);
  }
}

function readYaml(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return {};
  }
  try {
    return yaml.parse(raw) || {};
  } catch {
    fail(`Invalid YAML: ${filePath}`);
  }
}

function readToml(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return {};
  }
  try {
    return toml.parse(raw) || {};
  } catch {
    fail(`Invalid TOML: ${filePath}`);
  }
}

function outputList(filePath, keys, projectKey) {
  const header = projectKey ? `# ${filePath} (${projectKey})` : `# ${filePath}`;
  process.stdout.write(`${header}\n`);
  if (!keys.length) {
    process.stdout.write("- (none)\n");
    return;
  }
  for (const name of keys.sort()) {
    process.stdout.write(`- ${name}\n`);
  }
}

function outputWhere(filePath, serverName, found, projectKey) {
  const header = projectKey ? `# ${filePath} (${projectKey})` : `# ${filePath}`;
  process.stdout.write(`${header}\n`);
  process.stdout.write(`- ${serverName}: ${found ? "found" : "not found"}\n`);
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFile(filePath, content) {
  if (options.dryRun) {
    process.stdout.write(`\n# ${filePath}\n${content}\n`);
    return;
  }
  fs.writeFileSync(filePath, content, "utf8");
  process.stdout.write(`Updated ${filePath}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function printHelp(command) {
  const header = "mcp-conf";
  if (!command) {
    process.stdout.write(`${header}

Usage:
  mcp-conf <add|rm|ls|enable|disable|where> --client <name> [options]
  mcp-conf tui
  mcp-conf help <command>

Commands:
  add       add or update an MCP server entry
  rm        remove an MCP server entry
  ls        list MCP server entries
  enable    enable an existing entry
  disable   disable an existing entry
  where     show where a server name is defined
  tui       interactive setup wizard for add

Run:
  mcp-conf <command> --help
  mcp-conf help <command>

Notes:
  Scope defaults to --global (Copilot uses --local only).
  For Claude, --local maps to the project scope file ./.mcp.json.
  For Codex, --local writes to ./.codex/config.toml.
`);
    return;
  }
  switch (command) {
    case "add":
      process.stdout.write(`${header} add

Usage:
  mcp-conf add --client <name> --name <serverName> [--env | --env-path <path> | --mcp <dest>] [options]

Options:
  --client <name>       cline | codex | claude | goose | cursor | windsurf | opencode | kilo | copilot | antigravity (repeatable)
  --name <serverName>   required MCP server name key
  --env                 use current shell/session env vars (stdio only)
  --env-path <path>     .env path (stdio only)
  --mcp <dest>          destination name (stdio only)
  --transport <type>    stdio | sse | http (http => streamableHttp)
  --command <bin>       command to run (default: mcp-abap-adt)
  --global              write to global user config (default)
  --local               write to project config (where supported)
  --project <path>      Claude global: target a specific project path
  --url <http(s)://...> required for sse/http
  --header key=value    add request header (repeatable)
  --timeout <seconds>   entry timeout (default: 60)
  --force               overwrite existing entry
  --dry-run             print changes without writing files

Notes:
  Antigravity local scope is not supported yet; use --global.
`);
      break;
    case "rm":
      process.stdout.write(`${header} rm

Usage:
  mcp-conf rm --client <name> --name <serverName> [options]

Options:
  --client <name>       cline | codex | claude | goose | cursor | windsurf | opencode | kilo | copilot | antigravity (repeatable)
  --name <serverName>   required MCP server name key
  --global              write to global user config (default)
  --local               write to project config (where supported)
  --all-projects        Claude global: remove across all projects
  --project <path>      Claude global: target a specific project path
  --dry-run             print changes without writing files

Notes:
  Antigravity local scope is not supported yet; use --global.
`);
      break;
    case "ls":
      process.stdout.write(`${header} ls

Usage:
  mcp-conf ls --client <name> [options]

Options:
  --client <name>       cline | codex | claude | goose | cursor | windsurf | opencode | kilo | copilot | antigravity (repeatable)
  --global              write to global user config (default)
  --local               write to project config (where supported)
  --all-projects        Claude global: list across all projects
  --project <path>      Claude global: target a specific project path

Notes:
  Antigravity local scope is not supported yet; use --global.
`);
      break;
    case "enable":
      process.stdout.write(`${header} enable

Usage:
  mcp-conf enable --client <name> --name <serverName> [options]

Options:
  --client <name>       cline | codex | claude | goose | cursor | windsurf | opencode | kilo | copilot | antigravity (repeatable)
  --name <serverName>   required MCP server name key
  --global              write to global user config (default)
  --local               write to project config (where supported)
  --all-projects        Claude global: enable across all projects
  --project <path>      Claude global: target a specific project path
  --dry-run             print changes without writing files

Notes:
  Antigravity local scope is not supported yet; use --global.
`);
      break;
    case "disable":
      process.stdout.write(`${header} disable

Usage:
  mcp-conf disable --client <name> --name <serverName> [options]

Options:
  --client <name>       cline | codex | claude | goose | cursor | windsurf | opencode | kilo | copilot | antigravity (repeatable)
  --name <serverName>   required MCP server name key
  --global              write to global user config (default)
  --local               write to project config (where supported)
  --all-projects        Claude global: disable across all projects
  --project <path>      Claude global: target a specific project path
  --dry-run             print changes without writing files

Notes:
  Antigravity local scope is not supported yet; use --global.
`);
      break;
    case "where":
      process.stdout.write(`${header} where

Usage:
  mcp-conf where --client <name> --name <serverName> [options]

Options:
  --client <name>       cline | codex | claude | goose | cursor | windsurf | opencode | kilo | copilot | antigravity (repeatable)
  --name <serverName>   required MCP server name key
  --global              write to global user config (default)
  --local               write to project config (where supported)
  --all-projects        Claude global: search across all projects
  --project <path>      Claude global: target a specific project path

Notes:
  Antigravity local scope is not supported yet; use --global.
`);
      break;
    case "tui":
      process.stdout.write(`${header} tui

Usage:
  mcp-conf tui

Description:
  Start interactive setup wizard for add command.
  Wizard asks for client, scope, transport, auth source/URL,
  and for sse/http also timeout and headers.
`);
      break;
    default:
      process.stdout.write(`${header}

Unknown command "${command}".
Run:
  mcp-conf help
`);
  }
}
