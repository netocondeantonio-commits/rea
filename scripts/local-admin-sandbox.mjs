import { dirname } from "node:path";

/** Opt-in Docker sandbox. When it is on and docker is missing, the host is not used. */

const IMAGE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/u;
const ENGINE_KEYS = [
  "GHIDRA_INSTALL_DIR",
  "JAVA_HOME",
  "REA_JADX_MCP_JAR",
  "REA_RIZIN_COMMAND",
  "REA_OBJDUMP_COMMAND",
  "REA_GDB_COMMAND",
  "GHIDRA_MCP_BIN",
];

let activeJob;
let readConfig = () => sandboxConfigFrom(undefined);

export const imageOf = (value) =>
  typeof value === "string" && IMAGE.test(value.trim())
    ? value.trim()
    : "rea-sandbox:local";

export const clampMb = (value) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return 512;
  return Math.min(4096, Math.max(128, number));
};

export const clampCpu = (value) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return 1;
  return Math.min(4, number);
};

export const sandboxFields = (value) => ({
  sandbox: value?.sandbox === true,
  sandboxImage: imageOf(value?.sandboxImage),
  sandboxCpus: clampCpu(value?.sandboxCpus),
});

export const applySandboxSettings = (next, input) => {
  if (typeof input?.sandbox === "boolean") next.sandbox = input.sandbox;
  if (typeof input?.sandboxImage === "string")
    next.sandboxImage = imageOf(input.sandboxImage);
  if (input?.sandboxCpus !== undefined)
    next.sandboxCpus = clampCpu(input.sandboxCpus);
};

export const sandboxConfigFrom = (settings) => ({
  enabled: process.env.REA_SANDBOX === "1" || settings?.sandbox === true,
  image: imageOf(settings?.sandboxImage),
  memoryMb: clampMb(settings?.ramLimitMb),
  cpus: clampCpu(settings?.sandboxCpus),
});

export const setSandboxConfig = (reader) => {
  if (typeof reader === "function") readConfig = reader;
};

export const readSandboxConfig = () => readConfig();

export const setSandboxJob = (job) => {
  activeJob = job;
};

export const sandboxJob = () => ({
  directory:
    typeof activeJob?.directory === "string" ? activeJob.directory : "",
  target: typeof activeJob?.resolved === "string" ? activeJob.resolved : "",
});

const mountable = (host) =>
  typeof host === "string" &&
  host.startsWith("/") &&
  !host.includes(":") &&
  !host.includes(",") &&
  !host.includes("\n") &&
  !host.includes("\0");

const pushMount = (mounts, host, container, mode) => {
  if (!mountable(host)) return;
  if (mounts.some((item) => item.container === container)) return;
  mounts.push({ host, container, mode });
};

const collectMounts = (input) => {
  const mounts = [];
  const engines = input.engines ?? {};
  pushMount(mounts, input.repo, "/opt/rea", "ro");
  pushMount(mounts, input.jobDir, "/work", "rw");
  if (typeof input.targetPath === "string" && input.targetPath.startsWith("/"))
    pushMount(mounts, dirname(input.targetPath), "/evidence", "ro");
  pushMount(mounts, engines.GHIDRA_INSTALL_DIR, "/opt/ghidra", "ro");
  pushMount(mounts, engines.JAVA_HOME, "/opt/java", "ro");
  if (typeof engines.REA_JADX_MCP_JAR === "string")
    pushMount(mounts, dirname(engines.REA_JADX_MCP_JAR), "/opt/jadx", "ro");
  return mounts;
};

const rewriteValue = (value, mounts) => {
  if (typeof value !== "string" || !value.startsWith("/")) return value;
  const sorted = [...mounts].sort(
    (left, right) => right.host.length - left.host.length,
  );
  for (const mount of sorted) {
    if (value === mount.host) return mount.container;
    if (value.startsWith(`${mount.host}/`))
      return `${mount.container}${value.slice(mount.host.length)}`;
  }
  return value;
};

const containerEnv = (engines, mounts) => {
  const env = { HOME: "/tmp", PATH: "/usr/local/bin:/usr/bin:/bin" };
  for (const key of ENGINE_KEYS) {
    const value = engines?.[key];
    if (typeof value !== "string" || value.length === 0) continue;
    if (value.includes("\n") || value.includes("\0")) continue;
    env[key] = rewriteValue(value, mounts);
  }
  return env;
};

const identity = () => {
  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  const gid = typeof process.getgid === "function" ? process.getgid() : 0;
  return `${uid}:${gid}`;
};

const engineOnly = (env) => {
  const picked = {};
  for (const key of ENGINE_KEYS) {
    if (typeof env?.[key] === "string" && env[key].length > 0)
      picked[key] = env[key];
  }
  return picked;
};

export const sandboxArgs = (input) => {
  const mounts = collectMounts({
    ...input,
    engines: engineOnly(input.engines),
  });
  const env = containerEnv(engineOnly(input.engines), mounts);
  const tail = Array.isArray(input.argv) ? input.argv.slice(2) : [];
  const args = [
    "run",
    "--rm",
    "--network",
    "none",
    "--memory",
    `${clampMb(input.memoryMb)}m`,
    "--memory-swap",
    `${clampMb(input.memoryMb)}m`,
    "--cpus",
    String(clampCpu(input.cpus)),
    "--pids-limit",
    "128",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",
    "--workdir",
    "/work",
    "--user",
    identity(),
  ];
  for (const mount of mounts)
    args.push("-v", `${mount.host}:${mount.container}:${mount.mode}`);
  for (const [key, value] of Object.entries(env))
    args.push("-e", `${key}=${value}`);
  args.push(imageOf(input.image), "node", "/opt/rea/scripts/rea.mjs");
  for (const part of tail) args.push(rewriteValue(part, mounts));
  return args;
};

export const prepareSandbox = async (input, exists) => {
  const config = readSandboxConfig();
  if (!config.enabled || !input?.jobDir) return { enabled: false };
  if (!(await exists("docker"))) return { enabled: true, blocked: true };
  return {
    enabled: true,
    command: "docker",
    args: sandboxArgs({ ...config, ...input }),
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
  };
};
