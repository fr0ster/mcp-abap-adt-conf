#!/usr/bin/env node

const { Select, Input, Confirm } = require("enquirer");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CLIENTS = [
  { name: "cline", message: "Cline" },
  { name: "codex", message: "Codex" },
  { name: "claude", message: "Claude" },
  { name: "goose", message: "Goose" },
  { name: "cursor", message: "Cursor" },
  { name: "windsurf", message: "Windsurf" },
  { name: "opencode", message: "OpenCode (kilo)" },
  { name: "copilot", message: "GitHub Copilot" },
  { name: "antigravity", message: "Antigravity" },
  { name: "crush", message: "Crush" },
];

const HEADER_KEYS = [
  "x-mcp-destination",
  "x-sap-url",
  "x-sap-client",
  "x-sap-auth-type",
  "x-sap-jwt-token",
  "x-sap-user",
  "x-sap-password",
];

async function main() {
  const result = {
    headers: {},
    timeout: 60,
  };

  result.tuiAction = await askSelect("Operation", [
    { name: "ls", message: "📖 ls" },
    { name: "show", message: "🔎 show" },
    { name: "sep-view", role: "separator", message: "────────────" },
    { name: "add", message: "➕ add" },
    { name: "update", message: "✏️ update" },
    { name: "enable", message: "✅ enable" },
    { name: "disable", message: "⏸️ disable" },
    { name: "rm", message: "🗑️ rm" },
    { name: "sep-exit", role: "separator", message: "────────────" },
    { name: "exit", message: "🚪 exit" },
  ]);
  if (result.tuiAction === "exit") {
    emitResult({ tuiAction: "exit" });
    return;
  }
  const client = await askSelect(
    "Client",
    CLIENTS.map((item) => item.name),
    CLIENTS.map((item) => item.message),
  );
  result.clients = [client];
  await configureScope(result, client);

  if (["rm", "enable", "disable", "show", "update"].includes(result.tuiAction)) {
    const serverNames = listExistingServers(
      client,
      result.scope,
      result.allProjects,
      result.projectPath,
    );
    if (serverNames.length === 0) {
      throw new Error(`No existing MCP servers found for ${client} (${result.scope})`);
    }
    result.name = await askSelect("Server name", serverNames);
  } else if (result.tuiAction !== "ls") {
    result.name = await askInput("Server name", "abap");
  } else {
    result.name = null;
  }

  if (result.tuiAction !== "add") {
    if (result.tuiAction === "update") {
      await configureUpdate(result, client);
    }
    emitResult(result);
    return;
  }

  const transports = getSupportedTransports(client);
  result.transport =
    transports.length === 1 ? transports[0] : await askSelect("Transport", transports);

  if (result.transport === "stdio") {
    const authSource = await askSelect("Auth source for stdio", [
      "destination (--mcp=<name>)",
      "env name (--env=<name>)",
      "env file (--env-path=<name>)",
    ]);
    if (authSource.startsWith("destination")) {
      result.mcpDestination = await askInput("Destination name", "TRIAL");
      result.useSessionEnv = false;
      result.envName = null;
      result.envPath = null;
      result.url = null;
      emitResult(result);
      return;
    }
    if (authSource.startsWith("env name")) {
      result.envName = await askInput("Env name", "TRIAL");
      result.useSessionEnv = false;
      result.envPath = null;
      result.mcpDestination = null;
      result.url = null;
      emitResult(result);
      return;
    }
    if (authSource.startsWith("env file")) {
      result.envPath = await askInput("Path to .env file");
      result.useSessionEnv = false;
      result.envName = null;
      result.mcpDestination = null;
      result.url = null;
      emitResult(result);
      return;
    }
  }

  result.url = await askInput("Server URL (http/https)");
  result.timeout = await askPositiveNumber("Timeout seconds", 60);
  result.headers = await askHeaders();
  result.useSessionEnv = false;
  result.envPath = null;
  result.mcpDestination = null;

  emitResult(result);
}

async function configureUpdate(result, client) {
  const current = getServerConfig(
    client,
    result.scope,
    result.name,
    result.allProjects,
    result.projectPath,
  );
  const currentTransport = current.transport || "stdio";
  result.transport = currentTransport;
  result.command = current.command || "mcp-abap-adt";
  result.timeout = Number(current.timeout) > 0 ? Number(current.timeout) : 60;
  result.url = current.url || null;
  result.headers = current.headers || {};

  if (currentTransport === "stdio") {
    const authChoices = [
      "destination (--mcp=<name>)",
      "env name (--env=<name>)",
      "env file (--env-path=<name>)",
    ];
    const authType = current.auth?.type || "unknown";
    const authInitial =
      authType === "mcp" ? 0 : authType === "env" ? 1 : authType === "env-path" ? 2 : 0;
    const authSource = await askSelect("Auth source for stdio", authChoices, null, authInitial);
    if (authSource.startsWith("destination")) {
      result.mcpDestination = await askInput("Destination name", current.auth?.value || "TRIAL");
      result.useSessionEnv = false;
      result.envName = null;
      result.envPath = null;
      result.url = null;
      result.headers = {};
      return;
    }
    if (authSource.startsWith("env name")) {
      result.envName = await askInput("Env name", current.auth?.value || "TRIAL");
      result.useSessionEnv = false;
      result.envPath = null;
      result.mcpDestination = null;
      result.url = null;
      result.headers = {};
      return;
    }
    if (authSource.startsWith("env file")) {
      result.envPath = await askInput("Path to .env file", current.auth?.value || undefined);
      result.useSessionEnv = false;
      result.envName = null;
      result.mcpDestination = null;
      result.url = null;
      result.headers = {};
      return;
    }
  }

  result.url = await askInput("Server URL (http/https)", current.url || undefined);
  result.timeout = await askPositiveNumber("Timeout seconds", result.timeout);
  result.headers = await askHeaders(current.headers || {});
  result.useSessionEnv = false;
  result.envName = null;
  result.envPath = null;
  result.mcpDestination = null;
}

function emitResult(result) {
  fs.writeFileSync(3, JSON.stringify(result), "utf8");
}

async function askSelect(message, choices, choiceLabels, initial = 0) {
  const promptChoices = choices.map((value, index) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
    return {
      name: value,
      message: choiceLabels?.[index] || value,
    };
  });
  const select = new Select({
    name: "value",
    message,
    choices: promptChoices,
    initial,
    footer: "Use arrow keys + Enter. Ctrl+C to cancel.",
  });
  return select.run();
}

async function askInput(message, initial) {
  const input = new Input({
    name: "value",
    message,
    initial,
  });
  const value = await input.run();
  if (!String(value || "").trim()) {
    return askInput(message, initial);
  }
  return String(value).trim();
}

async function askPositiveNumber(message, initialValue) {
  while (true) {
    const raw = await askInput(message, String(initialValue));
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
}

async function askHeaders(initialHeaders = {}) {
  const headers = { ...initialHeaders };
  while (true) {
    const key = await askSelect("Header key", [...HEADER_KEYS, "done"]);
    if (key === "done") {
      return headers;
    }
    headers[key] = await askInput(`Value for ${key}`, headers[key] || undefined);
    const addMore = await new Confirm({
      name: "value",
      message: "Add another header?",
      initial: true,
    }).run();
    if (!addMore) {
      return headers;
    }
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

async function configureScope(result, clientName) {
  result.allProjects = false;
  result.projectPath = null;

  if (clientName === "claude") {
    result.scope = await askSelect("Scope", ["global", "local"]);
    if (result.scope === "local") {
      return;
    }
    if (supportsClaudeGlobalAllProjects(result.tuiAction)) {
      const globalMode = await askSelect("Claude global", [
        { name: "single", message: "for current project" },
        { name: "all", message: "for all projects" },
      ]);
      result.allProjects = globalMode === "all";
    }
    return;
  }

  const scopes = getSupportedScopes(clientName);
  result.scope = scopes.length === 1 ? scopes[0] : await askSelect("Scope", ["global", "local"]);
}

function supportsClaudeGlobalAllProjects(action) {
  return ["ls", "show", "rm", "enable", "disable"].includes(action);
}

function getSupportedTransports(clientName) {
  if (clientName === "codex") {
    return ["stdio", "http"];
  }
  return ["stdio", "sse", "http"];
}

function listExistingServers(clientName, scope, allProjects = false, projectPath = null) {
  const cliPath = path.join(__dirname, "mcp-conf.js");
  const scopeArg = scope === "local" ? "--local" : "--global";
  const cliArgs = [cliPath, "ls", "--client", clientName, scopeArg];
  if (allProjects) {
    cliArgs.push("--all-projects");
  } else if (projectPath) {
    cliArgs.push("--project", projectPath);
  }
  const run = spawnSync(process.execPath, cliArgs, {
    encoding: "utf8",
  });
  if (run.status !== 0) {
    const stderr = String(run.stderr || "").trim();
    throw new Error(stderr || "Failed to list existing servers for selected client/scope");
  }
  const stdout = String(run.stdout || "");
  const names = [];
  for (const line of stdout.split(/\r?\n/u)) {
    if (!line.startsWith("- ")) {
      continue;
    }
    const name = line.slice(2).trim();
    if (!name || name === "(none)") {
      continue;
    }
    names.push(name);
  }
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

function getServerConfig(clientName, scope, serverName, allProjects = false, projectPath = null) {
  const cliPath = path.join(__dirname, "mcp-conf.js");
  const scopeArg = scope === "local" ? "--local" : "--global";
  const cliArgs = [
    cliPath,
    "show",
    "--client",
    clientName,
    "--name",
    serverName,
    scopeArg,
    "--json",
    "--normalized",
  ];
  if (allProjects) {
    cliArgs.push("--all-projects");
  } else if (projectPath) {
    cliArgs.push("--project", projectPath);
  }
  const run = spawnSync(process.execPath, cliArgs, {
    encoding: "utf8",
  });
  if (run.status !== 0) {
    const stderr = String(run.stderr || "").trim();
    throw new Error(stderr || "Failed to read existing server config");
  }
  try {
    return JSON.parse(String(run.stdout || "{}"));
  } catch {
    throw new Error("Failed to parse existing server config");
  }
}

main().catch((error) => {
  if (isPromptCancelError(error)) {
    process.exit(0);
  }
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  if (isPromptCancelError(error)) {
    process.exit(0);
  }
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  if (isPromptCancelError(error)) {
    process.exit(0);
  }
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exit(1);
});

function isPromptCancelError(error) {
  if (error === "" || error === null || error === undefined) {
    return true;
  }
  if (typeof error === "string") {
    return error.toLowerCase().includes("cancel");
  }
  const message = String(error?.message || "");
  return (
    error?.code === "ERR_USE_AFTER_CLOSE" ||
    message.toLowerCase().includes("cancel") ||
    message.toLowerCase().includes("readline was closed")
  );
}
