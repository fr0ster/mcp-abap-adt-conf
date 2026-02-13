#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

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
if (
  action &&
  ["add", "rm", "ls", "show", "enable", "disable", "where", "update", "tui", "help"].includes(
    action,
  )
) {
  args.shift();
}
const options = {
  clients: [],
  envName: null,
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
  show: false,
  outputJson: false,
  outputNormalized: false,
  url: null,
  headers: {},
  timeout: 60,
};

if (args.includes("--help") || args.includes("-h") || action === "help") {
  const helpAction =
    action === "help"
      ? args[0]
      : action &&
          ["add", "rm", "ls", "show", "enable", "disable", "where", "update", "tui"].includes(
            action,
          )
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
  } else if (arg.startsWith("--env=")) {
    options.envName = arg.slice("--env=".length);
    options.useSessionEnv = false;
    options.envPath = null;
    options.mcpDestination = null;
  } else if (arg === "--env") {
    const maybePath = args[i + 1];
    if (maybePath && !maybePath.startsWith("-")) {
      if (looksLikeEnvPath(maybePath)) {
        // Backward-compatible form: --env /path/to/.env
        options.envPath = maybePath;
        options.envName = null;
      } else {
        options.envName = maybePath;
        options.envPath = null;
      }
      options.useSessionEnv = false;
      options.mcpDestination = null;
      i += 1;
    } else {
      options.useSessionEnv = true;
      options.envName = null;
      options.envPath = null;
      options.mcpDestination = null;
    }
  } else if (arg === "--env-path") {
    options.envPath = args[i + 1];
    options.envName = null;
    options.useSessionEnv = false;
    options.mcpDestination = null;
    i += 1;
  } else if (arg === "--session-env") {
    options.useSessionEnv = true;
    options.envName = null;
    options.envPath = null;
    options.mcpDestination = null;
  } else if (arg === "--mcp") {
    options.mcpDestination = args[i + 1];
    options.envName = null;
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
  } else if (arg === "--json") {
    options.outputJson = true;
  } else if (arg === "--normalized") {
    options.outputNormalized = true;
  }
}

if (
  !action ||
  !["add", "rm", "ls", "show", "enable", "disable", "where", "update", "tui"].includes(action)
) {
  fail("Provide a command: add | rm | ls | show | enable | disable | where | update | tui.");
}

let effectiveAction = action;
if (action === "tui") {
  runTuiWizard(options);
  effectiveAction = options.tuiAction || "add";
}
if (effectiveAction === "exit") {
  process.exit(0);
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
if (effectiveAction === "show") {
  options.show = true;
}
if (effectiveAction === "update") {
  options.force = true;
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
if (
  options.allProjects &&
  !options.list &&
  !options.toggle &&
  !options.remove &&
  !options.where &&
  !options.show
) {
  fail("--all-projects is only supported for rm/enable/disable/ls/where/show.");
}
if (options.projectPath && options.allProjects) {
  fail("Use either --project or --all-projects (not both).");
}
if (options.where && (options.list || options.remove || options.toggle || options.show)) {
  fail("The where command does not support ls/rm/enable/disable/show flags.");
}
if (
  options.projectPath &&
  ["add", "update"].includes(effectiveAction) &&
  options.scope !== "global"
) {
  fail("--project is only supported for Claude global config.");
}

const requiresConnectionParams =
  !options.remove && !options.toggle && !options.list && !options.where && !options.show;

if (requiresConnectionParams && options.transport === "stdio") {
  if (!options.envName && !options.envPath && !options.mcpDestination && !options.useSessionEnv) {
    fail("Provide --env <name>, --env-path <path>, --session-env, or --mcp <destination>.");
  }
}

if (requiresConnectionParams && options.transport !== "stdio") {
  if (!options.url) {
    fail("Provide --url <http(s)://...> for sse/http transports.");
  }
  if (options.envName || options.envPath || options.mcpDestination || options.useSessionEnv) {
    fail("--env/--env-path/--session-env/--mcp are only valid for stdio transport.");
  }
}

const platform = os.platform();
const home = os.homedir();
const appData = process.env.APPDATA || home;
const userProfile = process.env.USERPROFILE || home;

const serverArgsRaw = [
  `--transport=${options.transport}`,
  options.envName
    ? `--env=${options.envName}`
    : options.useSessionEnv
      ? "--session-env"
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
      } else if (options.show) {
        showJsonConfig(getClinePath(platform, home, appData), "cline", options.name);
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
      } else if (options.show) {
        showCodexConfig(getCodexPath(platform, home, userProfile, scope), options.name);
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
        const localPath = getClaudePath(home, "local");
        if (!claudeLocalHasServer(localPath, options.name)) {
          fail(`Server "${options.name}" not found in ${localPath}.`);
        }
      }
      if (options.list) {
        listClaudeConfig(
          getClaudePath(home, claudeToggleScope),
          options.allProjects,
          options.projectPath,
        );
      } else if (options.show) {
        showClaudeConfig(
          getClaudePath(home, claudeToggleScope),
          options.name,
          options.allProjects,
          options.projectPath,
        );
      } else if (options.where) {
        whereClaudeConfig(
          getClaudePath(home, claudeToggleScope),
          options.name,
          options.allProjects,
          options.projectPath,
        );
      } else {
        writeClaudeConfig(getClaudePath(home, claudeToggleScope), options.name, serverArgs);
      }
      break;
    }
    case "goose":
      requireScope("Goose", ["global"], scope);
      if (options.list) {
        listGooseConfig(getGoosePath(platform, home, appData));
      } else if (options.show) {
        showGooseConfig(getGoosePath(platform, home, appData), options.name);
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
      } else if (options.show) {
        showJsonConfig(getOpenCodePath(platform, home, appData, scope), "opencode", options.name);
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
      } else if (options.show) {
        showJsonConfig(getAntigravityPath(home, scope), "antigravity", options.name);
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
      } else if (options.show) {
        showJsonConfig(getCopilotPath(), "copilot", options.name);
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
      } else if (options.show) {
        showJsonConfig(getCursorPath(platform, home, userProfile, scope), "cursor", options.name);
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
      } else if (options.show) {
        showJsonConfig(getWindsurfPath(platform, home, userProfile), "windsurf", options.name);
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
    case "crush":
      requireScope("Crush", ["global", "local"], scope);
      if (options.list) {
        listJsonConfig(getCrushPath(platform, home, userProfile, scope), "crush");
      } else if (options.show) {
        showJsonConfig(getCrushPath(platform, home, userProfile, scope), "crush", options.name);
      } else if (options.where) {
        whereJsonConfig(getCrushPath(platform, home, userProfile, scope), "crush", options.name);
      } else {
        writeJsonConfig(
          getCrushPath(platform, home, userProfile, scope),
          options.name,
          serverArgs,
          "crush",
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
  const helperPath = path.join(__dirname, "mcp-conf-tui.js");
  const run = spawnSync(process.execPath, [helperPath], {
    stdio: ["inherit", "inherit", "inherit", "pipe"],
    encoding: "utf8",
  });
  if (run.error) {
    fail(`Failed to start TUI helper: ${run.error.message}`);
  }
  if (run.status !== 0) {
    process.exit(run.status || 1);
  }
  const rawPayload = run.output?.[3] || "";
  const payload = String(rawPayload).trim();
  if (!payload) {
    opts.tuiAction = "exit";
    return;
  }
  let selected;
  try {
    selected = JSON.parse(payload);
  } catch {
    fail("Invalid TUI output.");
  }
  Object.assign(opts, selected);
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
  if (platformValue === "darwin") {
    return path.join(
      homeDir,
      "Library",
      "Application Support",
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

function getClaudePath(homeDir, scopeValue) {
  if (scopeValue === "local") {
    return path.join(process.cwd(), ".mcp.json");
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

function getCrushPath(platformValue, homeDir, userProfileDir, scopeValue) {
  if (scopeValue === "local") {
    return path.join(process.cwd(), ".crush.json");
  }
  if (platformValue === "win32") {
    return path.join(userProfileDir, "AppData", "Local", "crush", "crush.json");
  }
  return path.join(homeDir, ".config", "crush", "crush.json");
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
  return ["cline", "codex", "windsurf", "goose", "claude", "opencode", "crush"].includes(
    clientType,
  );
}

function writeJsonConfig(filePath, serverName, argsArray, clientType) {
  ensureDir(filePath);
  const data = readJson(filePath);
  if (clientType === "opencode" || clientType === "crush") {
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
      clientType === "opencode" || clientType === "crush"
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
      clientType === "opencode" || clientType === "crush"
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
    clientType === "opencode" || clientType === "crush"
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
  if (clientType === "crush") {
    if (options.transport === "stdio") {
      store[serverName] = {
        type: "stdio",
        command: options.command,
        args: argsArray,
        timeout: options.timeout,
        disabled: !!(options.disabled || getDefaultDisabled("crush")),
      };
    } else {
      const entry = {
        type: options.transport === "streamableHttp" ? "http" : options.transport,
        url: options.url,
        timeout: options.timeout,
        disabled: !!(options.disabled || getDefaultDisabled("crush")),
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
  if (clientType === "opencode" || clientType === "crush") {
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
  if (clientType === "opencode" || clientType === "crush") {
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

function showJsonConfig(filePath, clientType, serverName) {
  const data = readJson(filePath);
  let store;
  if (clientType === "opencode" || clientType === "crush") {
    store = data.mcp || {};
  } else if (clientType === "antigravity") {
    store = data.mcpServers || {};
  } else if (clientType === "copilot") {
    store = data.servers || {};
  } else {
    store = data.mcpServers || {};
  }
  const entry = store[serverName];
  if (!entry) {
    fail(`Server "${serverName}" not found in ${filePath}.`);
  }
  const details = options.outputNormalized
    ? normalizeServerDetails(clientType, serverName, entry)
    : cloneJsonLike(entry);
  outputShow(filePath, serverName, details);
}

function showCodexConfig(filePath, serverName) {
  if (!toml) {
    fail("TOML dependency not available. Install dependencies and retry.");
  }
  const data = readToml(filePath);
  const store = data.mcp_servers || {};
  const entry = store[serverName];
  if (!entry) {
    fail(`Server "${serverName}" not found in ${filePath}.`);
  }
  const details = options.outputNormalized
    ? normalizeServerDetails("codex", serverName, entry)
    : cloneJsonLike(entry);
  outputShow(filePath, serverName, details);
}

function showGooseConfig(filePath, serverName) {
  if (!yaml) {
    fail("YAML dependency not available. Install dependencies and retry.");
  }
  const data = readYaml(filePath);
  const store = data.extensions || {};
  const entry = store[serverName];
  if (!entry) {
    fail(`Server "${serverName}" not found in ${filePath}.`);
  }
  const details = options.outputNormalized
    ? normalizeServerDetails("goose", serverName, entry)
    : cloneJsonLike(entry);
  outputShow(filePath, serverName, details);
}

function showClaudeConfig(filePath, serverName, allProjects, projectPath) {
  const data = readJson(filePath);
  const isDesktopConfig =
    filePath.endsWith(".claude.json") || filePath.endsWith("claude_desktop_config.json");
  if (isDesktopConfig) {
    const projects = Object.keys(data.projects || {});
    if (allProjects) {
      const results = [];
      for (const key of projects.sort()) {
        const projectNode = data.projects?.[key];
        const store = projectNode?.mcpServers || {};
        if (store[serverName]) {
          results.push(
            options.outputNormalized
              ? {
                  project: key,
                  ...normalizeServerDetails("claude", serverName, store[serverName]),
                }
              : {
                  project: key,
                  raw: cloneJsonLike(store[serverName]),
                },
          );
        }
      }
      if (!results.length) {
        fail(`Server "${serverName}" not found in any Claude projects.`);
      }
      if (options.outputJson) {
        process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
        return;
      }
      for (const result of results) {
        outputShow(
          filePath,
          serverName,
          options.outputNormalized ? result : result.raw,
          result.project,
        );
      }
      return;
    }
    const projectKey = resolveProjectSelector(data, projectPath);
    const store = data.projects?.[projectKey]?.mcpServers || {};
    const entry = store[serverName];
    if (!entry) {
      fail(`Server "${serverName}" not found for ${projectKey}.`);
    }
    const details = options.outputNormalized
      ? normalizeServerDetails("claude", serverName, entry, projectKey)
      : cloneJsonLike(entry);
    outputShow(filePath, serverName, details, projectKey);
    return;
  }
  const store = data.mcpServers || {};
  const entry = store[serverName];
  if (!entry) {
    fail(`Server "${serverName}" not found in ${filePath}.`);
  }
  const details = options.outputNormalized
    ? normalizeServerDetails("claude", serverName, entry)
    : cloneJsonLike(entry);
  outputShow(filePath, serverName, details);
}

function normalizeServerDetails(clientType, serverName, entry, projectKey) {
  const args = Array.isArray(entry?.args) ? entry.args : [];
  const parsedArgs = parseServerArgs(args);
  const command = entry?.command || entry?.cmd || "mcp-abap-adt";
  const normalized = {
    client: clientType,
    name: serverName,
    ...(projectKey ? { project: projectKey } : {}),
    transport: inferTransport(clientType, entry, parsedArgs),
    command,
    timeout: inferTimeout(clientType, entry),
    url: inferUrl(clientType, entry),
    headers: inferHeaders(clientType, entry),
    auth: inferAuth(parsedArgs),
  };
  return compactServerDetails(normalized);
}

function compactServerDetails(details) {
  const compact = {
    client: details.client,
    name: details.name,
    ...(details.project ? { project: details.project } : {}),
    transport: details.transport,
  };
  if (details.command) {
    compact.command = details.command;
  }
  if (Number.isFinite(details.timeout)) {
    compact.timeout = details.timeout;
  }
  if (details.transport === "stdio") {
    compact.auth = details.auth;
  } else {
    if (details.url) {
      compact.url = details.url;
    }
    if (details.headers && Object.keys(details.headers).length > 0) {
      compact.headers = details.headers;
    }
  }
  return compact;
}

function cloneJsonLike(value) {
  if (value === null || value === undefined) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function parseServerArgs(args) {
  const parsed = {
    transport: null,
    envName: null,
    envPath: null,
    mcpDestination: null,
    useSessionEnv: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (typeof arg !== "string") {
      continue;
    }
    if (arg.startsWith("--transport=")) {
      const value = arg.slice("--transport=".length);
      parsed.transport = value === "streamableHttp" ? "http" : value;
    } else if (arg === "--session-env") {
      parsed.useSessionEnv = true;
    } else if (arg.startsWith("--env=")) {
      const value = arg.slice("--env=".length);
      if (looksLikeEnvPath(value)) {
        parsed.envPath = value;
      } else {
        parsed.envName = value;
      }
    } else if (arg === "--env") {
      const next = args[i + 1];
      if (typeof next === "string" && next && !next.startsWith("-")) {
        if (looksLikeEnvPath(next)) {
          // Backward-compatible form: --env /path/to/.env
          parsed.envPath = next;
        } else {
          parsed.envName = next;
        }
        parsed.useSessionEnv = false;
        i += 1;
      } else {
        parsed.useSessionEnv = true;
      }
    } else if (arg.startsWith("--env-path=")) {
      parsed.envPath = arg.slice(arg.indexOf("=") + 1);
    } else if (arg === "--env-path") {
      const next = args[i + 1];
      if (typeof next === "string" && next && !next.startsWith("-")) {
        parsed.envPath = next;
        i += 1;
      }
    } else if (arg.startsWith("--mcp=")) {
      parsed.mcpDestination = arg.slice("--mcp=".length);
    } else if (arg === "--mcp") {
      const next = args[i + 1];
      if (typeof next === "string" && next && !next.startsWith("-")) {
        parsed.mcpDestination = next;
        i += 1;
      }
    }
  }
  return parsed;
}

function inferTransport(clientType, entry, parsedArgs) {
  if (parsedArgs.transport) {
    return parsedArgs.transport;
  }
  if (clientType === "goose") {
    if (entry?.type === "streamable_http") {
      return "http";
    }
    if (entry?.type === "sse") {
      return "sse";
    }
    return "stdio";
  }
  if (clientType === "opencode") {
    return entry?.type === "remote" ? "http" : "stdio";
  }
  if (clientType === "copilot") {
    if (entry?.type === "http") {
      return "http";
    }
    if (entry?.type === "sse") {
      return "sse";
    }
    return "stdio";
  }
  if (clientType === "antigravity") {
    return entry?.type === "http" ? "http" : "stdio";
  }
  if (clientType === "crush") {
    if (entry?.type === "http") return "http";
    if (entry?.type === "sse") return "sse";
    return "stdio";
  }
  if (entry?.type === "streamableHttp" || entry?.type === "http") {
    return "http";
  }
  if (entry?.type === "sse") {
    return "sse";
  }
  return "stdio";
}

function inferTimeout(clientType, entry) {
  if (clientType === "codex") {
    return entry?.startup_timeout_sec ?? 60;
  }
  return entry?.timeout ?? 60;
}

function inferUrl(clientType, entry) {
  if (clientType === "goose") {
    return entry?.uri || null;
  }
  if (clientType === "antigravity") {
    return entry?.serverUrl || null;
  }
  return entry?.url || null;
}

function inferHeaders(clientType, entry) {
  if (clientType === "codex") {
    return entry?.http_headers || {};
  }
  return entry?.headers || {};
}

function inferAuth(parsedArgs) {
  if (parsedArgs.mcpDestination) {
    return { type: "mcp", value: parsedArgs.mcpDestination };
  }
  if (parsedArgs.envName) {
    return { type: "env", value: parsedArgs.envName };
  }
  if (parsedArgs.envPath) {
    return { type: "env-path", value: parsedArgs.envPath };
  }
  if (parsedArgs.useSessionEnv) {
    return { type: "session-env", value: null };
  }
  return { type: "unknown", value: null };
}

function looksLikeEnvPath(value) {
  if (!value || typeof value !== "string") {
    return false;
  }
  return (
    value.includes("/") ||
    value.includes("\\") ||
    value.endsWith(".env") ||
    value.startsWith(".") ||
    value.startsWith("~")
  );
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

function outputShow(filePath, serverName, details, projectKey) {
  if (options.outputJson) {
    process.stdout.write(`${JSON.stringify(details, null, 2)}\n`);
    return;
  }
  const header = projectKey ? `# ${filePath} (${projectKey})` : `# ${filePath}`;
  process.stdout.write(`${header}\n`);
  process.stdout.write(`- ${serverName}: ${JSON.stringify(details, null, 2)}\n`);
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
  mcp-conf <add|rm|ls|show|enable|disable|where|update> --client <name> [options]
  mcp-conf tui
  mcp-conf help <command>

Commands:
  add       add or update an MCP server entry
  rm        remove an MCP server entry
  ls        list MCP server entries
  show      show server configuration details
  enable    enable an existing entry
  disable   disable an existing entry
  where     show where a server name is defined
  update    update an existing server entry
  tui       interactive setup wizard

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
  mcp-conf add --client <name> --name <serverName> [--env <name> | --env-path <path> | --session-env | --mcp <dest>] [options]

Options:
  --client <name>       cline | codex | claude | goose | cursor | windsurf | opencode | kilo | copilot | antigravity | crush (repeatable)
  --name <serverName>   required MCP server name key
  --env <name>          env profile name (stdio only), writes --env=<name>
  --env-path <path>     .env path (stdio only)
  --session-env         use current shell/session env vars (stdio only)
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
  --client <name>       cline | codex | claude | goose | cursor | windsurf | opencode | kilo | copilot | antigravity | crush (repeatable)
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
  --client <name>       cline | codex | claude | goose | cursor | windsurf | opencode | kilo | copilot | antigravity | crush (repeatable)
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
  --client <name>       cline | codex | claude | goose | cursor | windsurf | opencode | kilo | copilot | antigravity | crush (repeatable)
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
  --client <name>       cline | codex | claude | goose | cursor | windsurf | opencode | kilo | copilot | antigravity | crush (repeatable)
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
  --client <name>       cline | codex | claude | goose | cursor | windsurf | opencode | kilo | copilot | antigravity | crush (repeatable)
  --name <serverName>   required MCP server name key
  --global              write to global user config (default)
  --local               write to project config (where supported)
  --all-projects        Claude global: search across all projects
  --project <path>      Claude global: target a specific project path

Notes:
  Antigravity local scope is not supported yet; use --global.
`);
      break;
    case "show":
      process.stdout.write(`${header} show

Usage:
  mcp-conf show --client <name> --name <serverName> [options]

Options:
  --client <name>       cline | codex | claude | goose | cursor | windsurf | opencode | kilo | copilot | antigravity | crush (repeatable)
  --name <serverName>   required MCP server name key
  --global              read from global user config (default)
  --local               read from project config (where supported)
  --all-projects        Claude global: show from all projects
  --project <path>      Claude global: target a specific project path
  --json                output JSON only (machine-readable)
  --normalized          output normalized view (for tooling); default is raw config entry

Notes:
  Antigravity local scope is not supported yet; use --global.
`);
      break;
    case "update":
      process.stdout.write(`${header} update

Usage:
  mcp-conf update --client <name> --name <serverName> [--env <name> | --env-path <path> | --session-env | --mcp <dest>] [options]

Options:
  --client <name>       cline | codex | claude | goose | cursor | windsurf | opencode | kilo | copilot | antigravity | crush (repeatable)
  --name <serverName>   required MCP server name key
  --env <name>          env profile name (stdio only), writes --env=<name>
  --env-path <path>     .env path (stdio only)
  --session-env         use current shell/session env vars (stdio only)
  --mcp <dest>          destination name (stdio only)
  --transport <type>    stdio | sse | http (http => streamableHttp)
  --url <http(s)://...> required for sse/http
  --header key=value    add request header (repeatable)
  --timeout <seconds>   entry timeout (default: 60)
  --global              write to global user config (default)
  --local               write to project config (where supported)
  --project <path>      Claude global: target a specific project path
  --dry-run             print changes without writing files

Notes:
  Antigravity local scope is not supported yet; use --global.
`);
      break;
    case "tui":
      process.stdout.write(`${header} tui

Usage:
  mcp-conf tui

Description:
  Start interactive setup wizard for ls/show/add/update/rm/enable/disable.
  Flow: operation -> client -> scope (skips scope when only one is supported).
  For add/update + sse/http, wizard also asks timeout and repeatable headers.
  For rm/enable/disable/show/update, wizard selects server from existing entries.
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
