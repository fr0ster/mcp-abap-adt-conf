#!/usr/bin/env node

const { Select, Input, Confirm } = require("enquirer");
const fs = require("node:fs");

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

  result.tuiAction = await askSelect("Operation", ["ls", "add", "rm", "enable", "disable"]);
  const client = await askSelect(
    "Client",
    CLIENTS.map((item) => item.name),
    CLIENTS.map((item) => item.message),
  );
  result.clients = [client];

  const scopes = getSupportedScopes(client);
  result.scope = scopes.length === 1 ? scopes[0] : await askSelect("Scope", ["global", "local"]);

  if (result.tuiAction !== "ls") {
    result.name = await askInput("Server name", "abap");
  } else {
    result.name = null;
  }

  if (result.tuiAction !== "add") {
    emitResult(result);
    return;
  }

  const transports = getSupportedTransports(client);
  result.transport =
    transports.length === 1 ? transports[0] : await askSelect("Transport", transports);

  if (result.transport === "stdio") {
    const authSource = await askSelect("Auth source for stdio", [
      "service key destination (--mcp)",
      "session environment (--env)",
      "specific env file (--env-path)",
    ]);
    if (authSource.startsWith("service key")) {
      result.mcpDestination = await askInput("Destination name", "TRIAL");
      result.useSessionEnv = false;
      result.envPath = null;
      result.url = null;
      emitResult(result);
      return;
    }
    if (authSource.startsWith("specific env file")) {
      result.envPath = await askInput("Path to .env file");
      result.useSessionEnv = false;
      result.mcpDestination = null;
      result.url = null;
      emitResult(result);
      return;
    }
    result.useSessionEnv = true;
    result.envPath = null;
    result.mcpDestination = null;
    result.url = null;
    emitResult(result);
    return;
  }

  result.url = await askInput("Server URL (http/https)");
  result.timeout = await askPositiveNumber("Timeout seconds", 60);
  result.headers = await askHeaders();
  result.useSessionEnv = false;
  result.envPath = null;
  result.mcpDestination = null;

  emitResult(result);
}

function emitResult(result) {
  fs.writeFileSync(3, JSON.stringify(result), "utf8");
}

async function askSelect(message, choices, choiceLabels) {
  const promptChoices = choices.map((value, index) => ({
    name: value,
    message: choiceLabels?.[index] || value,
  }));
  const select = new Select({
    name: "value",
    message,
    choices: promptChoices,
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

async function askHeaders() {
  const headers = {};
  while (true) {
    const key = await askSelect("Header key", [...HEADER_KEYS, "done"]);
    if (key === "done") {
      return headers;
    }
    headers[key] = await askInput(`Value for ${key}`);
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

function getSupportedTransports(clientName) {
  if (clientName === "codex") {
    return ["stdio", "http"];
  }
  return ["stdio", "sse", "http"];
}

main().catch((error) => {
  if (error === "") {
    process.exit(0);
  }
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exit(1);
});
