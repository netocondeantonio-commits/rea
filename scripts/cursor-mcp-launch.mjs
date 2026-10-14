import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Start a Cursor MCP server for this checkout without shell expansion.
 * Cursor does not expand `$HOME` inside mcp.json. This launcher reads the
 * env file written by scripts/install-free-analysis-engines.mjs.
 *
 *   node scripts/cursor-mcp-launch.mjs rea
 *   node scripts/cursor-mcp-launch.mjs ghidra-mcp
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];

const defaultEnvFile = () =>
  join(process.env.HOME ?? ".", ".local", "share", "rea", "cursor-engines.env");

const unquote = (value) => {
  if (!value.startsWith("'")) return value;
  let result = "";
  let index = 1;
  while (index < value.length) {
    const quote = value.indexOf("'", index);
    if (quote === -1) return value;
    result += value.slice(index, quote);
    if (value.slice(quote, quote + 4) === "'\\''") {
      result += "'";
      index = quote + 4;
      continue;
    }
    return result;
  }
  return value;
};

const parseEnvFile = (text) => {
  const parsed = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const body = trimmed.startsWith("export ")
      ? trimmed.slice(7).trim()
      : trimmed;
    const separator = body.indexOf("=");
    if (separator <= 0) continue;
    const key = body.slice(0, separator);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;
    parsed[key] = unquote(body.slice(separator + 1));
  }
  return parsed;
};

const loadEngines = async () => {
  const path = process.env.REA_CURSOR_ENGINES_ENV ?? defaultEnvFile();
  try {
    return parseEnvFile(await readFile(path, "utf8"));
  } catch (cause) {
    if (cause?.code !== "ENOENT") throw cause;
    process.stderr.write(
      `No engine env file at ${path}. Run scripts/install-free-analysis-engines.mjs first.\n`,
    );
    return {};
  }
};

const forward = (command, args, env) => {
  const child = spawn(command, args, { stdio: "inherit", env });
  child.on("error", (cause) => {
    process.stderr.write(`${command} failed to start: ${cause.message}\n`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    if (signal !== null) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
};

const engines = await loadEngines();
const env = { ...process.env, ...engines };

if (mode === "rea") {
  forward(process.execPath, [join(root, "scripts", "rea.mjs"), "mcp"], env);
} else if (mode === "ghidra-mcp") {
  const server = engines.GHIDRA_MCP_SERVER ?? "http://127.0.0.1:8080/";
  forward(
    engines.GHIDRA_MCP_BIN ?? "ghidra-mcp",
    ["--ghidra-server", server],
    env,
  );
} else {
  process.stderr.write(
    "Usage: node scripts/cursor-mcp-launch.mjs <rea|ghidra-mcp>\n",
  );
  process.exit(2);
}
