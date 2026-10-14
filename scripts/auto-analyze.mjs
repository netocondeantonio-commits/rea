import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { bindAddress } from "./local-admin-access.mjs";
import { createPlan } from "./local-analyze-plan.mjs";
import { loadEnvFile } from "./local-admin-auth.mjs";
import {
  prepareSandbox,
  sandboxConfigFrom,
  sandboxJob,
  setSandboxConfig,
} from "./local-admin-sandbox.mjs";
import { openAdmin } from "./local-admin-store.mjs";
import { notifyJobFinished } from "./local-admin-schedule.mjs";
import {
  createJob,
  currentLimits,
  enqueueJob,
  loadHistory,
  mergedEnv,
  saveIndex,
  setEngineEnv,
} from "./local-analyze-jobs.mjs";
import { analyze, bindLocalAnalyzer } from "./local-analyze-run.mjs";
import { startLocalDashboard } from "./local-analyze-http.mjs";

/**
 * Local operator helper. It shells out to the existing REA CLI, writes a
 * report, and can serve a loopback page. It does not change CLI or MCP
 * behavior and it does not call a model.
 */

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reaScript = join(root, "scripts", "rea.mjs");
const dashboardPath = join(root, "scripts", "local-analyze-dashboard.html");

const help = () => {
  process.stderr.write(
    `Uso:
  npm run analyze -- --serve
  npm run analyze -- <caminho-ou-url-github>
  npm run analyze -- <caminho> --no-serve

Opções: --serve  --no-serve  --port <n>  --host <ip>  --output <dir>
Por padrão o painel escuta em 127.0.0.1. Use --host 0.0.0.0 atrás de um proxy.
As portas 80 e 443 ficam com o proxy. O painel pede um usuário local.
Senha: REA_ADMIN_PASSWORD. Token opcional para scripts: REA_ADMIN_TOKEN.
Cada execução também grava um pacote bilíngue em output/<alvo>/.
`,
  );
};

const parseArgs = (argv) => {
  let serve = false;
  let noServe = false;
  let outputExplicit = false;
  let host = process.env.REA_BIND ?? "127.0.0.1";
  let port = Number(process.env.REA_ANALYZE_PORT ?? 4174);
  let output =
    process.env.REA_ANALYZE_OUTPUT ??
    join(homedir(), ".local", "share", "rea", "analyses");
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--serve") serve = true;
    else if (argument === "--no-serve") noServe = true;
    else if (argument === "--port") port = Number(argv[(index += 1)]);
    else if (argument === "--host") host = String(argv[(index += 1)] ?? "");
    else if (argument === "--output") {
      output = resolve(argv[(index += 1)] ?? "");
      outputExplicit = true;
    } else if (argument.startsWith("-"))
      throw new Error(`Opção desconhecida: ${argument}`);
    else positionals.push(argument);
  }
  const bound = bindAddress(host, port);
  if (bound.error) throw new Error(bound.error);
  if (positionals.length > 1) throw new Error("Informe um único alvo.");
  return {
    help: false,
    serve: serve || (positionals.length === 1 && !noServe),
    noServe,
    host: bound.host,
    port: bound.port,
    output: resolve(output),
    outputExplicit,
    baseOutput: resolve(output),
    target: positionals[0],
  };
};

const exists = async (path) => {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch (cause) {
    if (cause?.code === "ENOENT") return false;
    throw cause;
  }
};

const commandExists = async (command) => {
  if (command.includes("/")) return exists(command);
  const path = process.env.PATH ?? "";
  for (const directory of path.split(":")) {
    if (directory.length === 0) continue;
    if (await exists(join(directory, command))) return true;
  }
  return false;
};

const readMagic = async (path) => {
  const handle = await readFile(path);
  return handle.subarray(0, 4);
};

const detectFile = async (path) => {
  const extension = extname(path).toLowerCase();
  if ([".apk", ".xapk", ".aab"].includes(extension)) return "android";
  if (extension === ".asar") return "javascript";
  if (extension === ".dll" || extension === ".exe") return "pe";
  const magic = await readMagic(path);
  if (magic[0] === 0x7f && magic.toString("utf8", 1, 4) === "ELF")
    return "native";
  if (magic[0] === 0x4d && magic[1] === 0x5a) return "pe";
  if (
    magic.toString("hex") === "cffaedfe" ||
    magic.toString("hex") === "cefaedfe" ||
    magic.toString("hex") === "feedface" ||
    magic.toString("hex") === "feedfacf"
  )
    return "native";
  return "unknown";
};

const detectDirectory = async (path) => {
  if (await exists(join(path, "package.json"))) return "javascript";
  if (await exists(join(path, "index.html"))) return "website";
  return "unknown";
};

const detectTarget = async (path) => {
  const info = await stat(path);
  if (info.isDirectory()) return detectDirectory(path);
  if (info.isFile()) return detectFile(path);
  return "unknown";
};

const isAbort = (cause) =>
  cause?.name === "AbortError" || cause?.code === "ABORT_ERR";

const childCommand = async (args) => {
  const prepared = await prepareSandbox(
    {
      repo: root,
      jobDir: sandboxJob().directory,
      targetPath: sandboxJob().target,
      argv: [process.execPath, reaScript, ...args, "--json"],
      engines: mergedEnv(),
    },
    commandExists,
  );
  if (prepared.blocked)
    return {
      blocked: true,
      reason: prepared.reason,
      command: process.execPath,
      argv: [],
      env: {},
    };
  if (prepared.enabled)
    return {
      command: prepared.command,
      argv: prepared.args,
      env: prepared.env,
    };
  const nice = currentLimits().cpuNice;
  const useNice = nice > 0 && (await commandExists("nice"));
  return {
    command: useNice ? "nice" : process.execPath,
    argv: useNice
      ? ["-n", String(nice), process.execPath, reaScript, ...args, "--json"]
      : [reaScript, ...args, "--json"],
    env: mergedEnv(),
  };
};

const sandboxBlocked = (reason) =>
  reason === "docker"
    ? "Sandbox pedido e o Docker não está disponível."
    : "Sandbox pedido e o isolamento (unshare, prlimit ou taskset) não está disponível.";

const runRea = async (args, timeoutMs, signal) => {
  const launched = await childCommand(args);
  if (launched.blocked)
    return {
      ok: false,
      stdout: "",
      stderr: sandboxBlocked(launched.reason),
    };
  const child = {
    cwd: root,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: launched.env,
  };
  if (signal) child.signal = signal;
  try {
    const { stdout, stderr } = await execFileAsync(
      launched.command,
      launched.argv,
      child,
    );
    return { ok: true, stdout, stderr };
  } catch (cause) {
    if (isAbort(cause))
      return { ok: false, cancelled: true, stdout: "", stderr: "Cancelado." };
    const error = cause instanceof Error ? cause : new Error(String(cause));
    const stdout = typeof error.stdout === "string" ? error.stdout : "";
    const stderr = typeof error.stderr === "string" ? error.stderr : "";
    return {
      ok: false,
      stdout,
      stderr: stderr.length > 0 ? stderr : error.message,
    };
  }
};

const parseJson = (text) => {
  const trimmed = text.trim();
  if (trimmed.length === 0) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
};

const clip = (value, max = 1200) => {
  const text = String(value);
  return text.length > max ? `${text.slice(0, max)}\n…` : text;
};

const stripAnsi = (text) => {
  let result = "";
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\u001b" && text[index + 1] === "[") {
      const end = text.indexOf("m", index);
      if (end !== -1) {
        index = end;
        continue;
      }
    }
    result += text[index];
  }
  return result;
};

const subjectFacts = (subject) => {
  if (subject === null || typeof subject !== "object") return [];
  const facts = [];
  if (typeof subject.name === "string") facts.push(`nome: ${subject.name}`);
  if (typeof subject.format === "string")
    facts.push(`formato: ${subject.format}`);
  if (typeof subject.architecture === "string")
    facts.push(`arquitetura: ${subject.architecture}`);
  return facts;
};

const normalizedFacts = (normalized) => {
  if (typeof normalized === "string") return [clip(normalized, 500)];
  if (normalized === null || typeof normalized !== "object") return [];
  const facts = [];
  for (const key of [
    "package_name",
    "version_name",
    "version_code",
    "class_count",
    "min_sdk",
    "target_sdk",
  ]) {
    const field = normalized[key];
    if (typeof field === "string" || typeof field === "number")
      facts.push(`${key}: ${field}`);
  }
  const nodes = normalized.graph?.nodes;
  if (Array.isArray(nodes)) facts.push(`nós do grafo: ${nodes.length}`);
  return facts;
};

const factsFrom = (value) => {
  if (value === undefined || value === null || typeof value !== "object")
    return [];
  const evidence =
    "evidence" in value && value.evidence !== null ? value.evidence : value;
  if (evidence === null || typeof evidence !== "object") return [];
  const facts = [
    ...subjectFacts(evidence.subject),
    ...normalizedFacts(evidence.normalized_result),
  ];
  if (Array.isArray(evidence.limitations))
    facts.push(`limitações registradas: ${evidence.limitations.length}`);
  const stdout = evidence.raw_result?.stdout;
  if (typeof stdout === "string" && facts.length < 4)
    facts.push(clip(stripAnsi(stdout), 500));
  return facts.slice(0, 8);
};

const { planSteps } = createPlan({ mergedEnv, commandExists, runRea });

const loadAdminEnv = async () => {
  if (process.env.REA_ADMIN_ENV) await loadEnvFile(process.env.REA_ADMIN_ENV);
  await loadEnvFile(join(root, ".env"));
  await loadEnvFile(join(homedir(), ".local", "share", "rea", "admin.env"));
};

const openLocalAdmin = async (current) => {
  const admin = await openAdmin({
    directory:
      process.env.REA_ADMIN_DIR ??
      join(homedir(), ".local", "share", "rea", "admin"),
  });
  setEngineEnv(() => admin.engineEnv());
  if (!current.outputExplicit && admin.readSettings().outputDir.length > 0)
    current.output = resolve(admin.readSettings().outputDir);
  if (admin.generatedPassword)
    process.stderr.write(
      `Senha inicial do administrador local: ${admin.generatedPassword}\n`,
    );
  setSandboxConfig(() => sandboxConfigFrom(admin.readSettings()));
  return admin;
};

const reportCli = (job) => {
  const packageReadme =
    job.package_slug === undefined
      ? ""
      : `${join(job.directory, "output", job.package_slug, "README.pt-BR.md")}\n`;
  process.stderr.write(
    `${job.headline}\n${join(job.directory, "report.md")}\n${packageReadme}`,
  );
};

await loadAdminEnv();
let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (cause) {
  process.stderr.write(`${cause instanceof Error ? cause.message : cause}\n`);
  process.exit(2);
}
if (options.help || (options.target === undefined && !options.serve)) {
  help();
  process.exit(options.help ? 0 : 2);
}
const admin = await openLocalAdmin(options);
bindLocalAnalyzer({
  runRea,
  commandExists,
  detectTarget,
  planSteps,
  exists,
  parseJson,
  factsFrom,
  integritySecret: () => admin.secret,
  onFinished: (job) => notifyJobFinished(admin, job),
});
await mkdir(options.output, { recursive: true });
const jobs = new Map();
await loadHistory(options.output, jobs);
if (options.serve)
  await startLocalDashboard({
    options,
    jobs,
    dashboardPath,
    analyze,
    admin,
    runRea,
    commandExists,
  });
if (options.target !== undefined && options.serve) {
  const job = createJob(options.output, options.target, { user: "cli" });
  jobs.set(job.id, job);
  await saveIndex(job);
  enqueueJob(job, analyze);
  await admin.audit({
    user: "cli",
    action: "analyze",
    detail: job.target.slice(0, 180),
  });
}
if (options.target !== undefined && !options.serve) {
  const job = createJob(options.output, options.target, { user: "cli" });
  jobs.set(job.id, job);
  await admin.audit({
    user: "cli",
    action: "analyze",
    detail: job.target.slice(0, 180),
  });
  await analyze(job, () => {});
  reportCli(job);
  process.exit(job.state === "done" ? 0 : 1);
}
