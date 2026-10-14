import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

/**
 * Download the free analysis engines a Cursor checkout can use, without
 * installing Java, Hopper, or IDA. This is an operator helper. `rea setup`
 * never runs it.
 *
 * Ghidra 12.1.4 asset digest from the NationalSecurityAgency/ghidra release
 * Ghidra_12.1.4_build. JADX and the sample APK stay pinned by
 * scripts/fixtures/android/fetch.mjs.
 */

const JADX_CLI_RELEASE = Object.freeze({
  version: "1.5.6",
  filename: "jadx-1.5.6.zip",
  sha256: "545ea2be9c242511bc145755cf4bda2485ade42966e096f8b4d3da2a230e8974",
  url: "https://github.com/skylot/jadx/releases/download/v1.5.6/jadx-1.5.6.zip",
});

const RIZIN_RELEASE = Object.freeze({
  version: "0.9.1",
  filename: "rizin-v0.9.1-static-x86_64.tar.xz",
  sha256: "9102249a9f0b6319c5334a2e5cf8d9cc3f2035e1d3def027c41f6a90f647e8cf",
  url: "https://github.com/rizinorg/rizin/releases/download/v0.9.1/rizin-v0.9.1-static-x86_64.tar.xz",
});

const GHIDRA_MCP_RELEASE = Object.freeze({
  version: "2.0.0",
  filename: "GhidraMCP-release-2-0.zip",
  sha256: "ebf904fd6782e429e95a60a24fe0724b20c0acb2dedb304135a5281f6b5f2e72",
  url: "https://github.com/LaurieWired/GhidraMCP/releases/download/2.0/GhidraMCP-release-2-0.zip",
  extensionName: "ghidra_12.1.4_PUBLIC_20261010_GhidraMCP.zip",
  pip: "ghidra-mcp[headless] @ git+https://github.com/LaurieWired/GhidraMCP@2.0",
});

const FRIDA_TOOLS = Object.freeze({
  frida: "17.23.2",
  tools: "14.11.0",
});

const GHIDRA_RELEASE = Object.freeze({
  version: "12.1.4",
  filename: "ghidra_12.1.4_PUBLIC_20260921.zip",
  directoryName: "ghidra_12.1.4_PUBLIC",
  sha256: "ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db",
  url: "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip",
});

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const destinationRoot = () =>
  resolve(
    process.env.REA_FREE_ENGINES_DIR ??
      join(process.env.HOME ?? ".", ".local", "share", "rea"),
  );

const commandOutput = async (command, args) => {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
    });
    return `${stdout}\n${stderr}`;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    error.message = `${command} ${args.join(" ")} failed: ${error.message}`;
    throw error;
  }
};

const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

const requireFullJdk = async () => {
  const versionText = await commandOutput("java", ["-version"]);
  const version = /version "(?<major>\d+)/u.exec(versionText)?.groups?.major;
  if (version === undefined || Number(version) < 21)
    throw new Error(
      "REA's verified Ghidra 12.1.x and JADX paths need a full JDK 21 or newer. Install one and put java and javac on PATH. This script does not install Java.",
    );
  await commandOutput("javac", ["-version"]);
  const modules = await commandOutput("java", ["--list-modules"]);
  if (!modules.includes("jdk.compiler@"))
    throw new Error(
      "The selected Java runtime has no jdk.compiler module. Select a full JDK through JAVA_HOME or PATH. This script does not install Java.",
    );
  if (process.env.JAVA_HOME !== undefined && process.env.JAVA_HOME.length > 0) {
    await access(join(process.env.JAVA_HOME, "bin", "javac"), constants.X_OK);
    return process.env.JAVA_HOME;
  }
  const javacPath = (await commandOutput("which", ["javac"])).trim();
  const realPath = (await commandOutput("readlink", ["-f", javacPath])).trim();
  return dirname(dirname(realPath));
};

const hashFile = async (path) => {
  const hash = createHash("sha256");
  const handle = await open(path, "r");
  try {
    const stream = handle.createReadStream();
    for await (const chunk of stream) hash.update(chunk);
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
};

const downloadVerified = async (url, path, sha256) => {
  const temporary = `${path}.${randomUUID()}.partial`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok || response.body === null)
      throw new Error(`Download failed: ${url}: HTTP ${response.status}`);
    const handle = await open(temporary, "wx", 0o600);
    const hash = createHash("sha256");
    try {
      for await (const chunk of response.body) {
        hash.update(chunk);
        await handle.write(chunk);
      }
    } finally {
      await handle.close();
    }
    const digest = hash.digest("hex");
    if (digest !== sha256)
      throw new Error(
        `SHA-256 mismatch for ${path}: expected ${sha256}, received ${digest}`,
      );
    await rm(path, { force: true });
    await link(temporary, path);
    return digest;
  } finally {
    await rm(temporary, { force: true });
  }
};

const ghidraReady = async (installDir) => {
  try {
    await access(
      join(installDir, "support", "analyzeHeadless"),
      constants.X_OK,
    );
    const properties = await readFile(
      join(installDir, "Ghidra", "application.properties"),
      "utf8",
    );
    return properties.includes(`application.version=${GHIDRA_RELEASE.version}`);
  } catch (cause) {
    if (cause?.code === "ENOENT") return false;
    throw cause;
  }
};

const installGhidra = async (rootDir) => {
  const ghidraRoot = join(rootDir, "ghidra");
  const installDir = join(ghidraRoot, GHIDRA_RELEASE.directoryName);
  await mkdir(ghidraRoot, { recursive: true });
  if (await ghidraReady(installDir)) {
    process.stderr.write(`Verified existing ${installDir}\n`);
    return installDir;
  }
  const archive = join(ghidraRoot, GHIDRA_RELEASE.filename);
  let digest;
  try {
    digest = await hashFile(archive);
  } catch (cause) {
    if (cause?.code !== "ENOENT") throw cause;
    digest = undefined;
  }
  if (digest !== GHIDRA_RELEASE.sha256) {
    process.stderr.write(`Downloading ${GHIDRA_RELEASE.url}\n`);
    digest = await downloadVerified(
      GHIDRA_RELEASE.url,
      archive,
      GHIDRA_RELEASE.sha256,
    );
  }
  process.stderr.write(`Extracting ${archive}\n`);
  await execFileAsync("unzip", ["-qo", archive, "-d", ghidraRoot]);
  if (!(await ghidraReady(installDir)))
    throw new Error(
      `Ghidra ${GHIDRA_RELEASE.version} did not extract to ${installDir}`,
    );
  process.stderr.write(
    `Verified Ghidra ${GHIDRA_RELEASE.version}: ${digest}\n`,
  );
  return installDir;
};

const installAndroidSamples = async (rootDir) => {
  const androidDir = join(rootDir, "android");
  await mkdir(androidDir, { recursive: true });
  await execFileAsync(
    process.execPath,
    [
      fileURLToPath(new URL("./fixtures/android/fetch.mjs", import.meta.url)),
      androidDir,
    ],
    { cwd: root },
  );
  const jar = join(androidDir, "jadx-headless-mcp-0.7.1-all.jar");
  const apk = join(androidDir, "ApiDemos-debug.apk");
  await access(jar, constants.R_OK);
  await access(apk, constants.R_OK);
  return { jar, apk };
};

const whichCommand = async (name) => {
  try {
    const path = (await commandOutput("which", [name])).trim();
    return path.length > 0 ? path : undefined;
  } catch (cause) {
    if (cause instanceof Error) return undefined;
    throw cause;
  }
};

const ensureDebianPackage = async (commandName, packageName) => {
  const existing = await whichCommand(commandName);
  if (existing !== undefined) return existing;
  if (process.platform !== "linux")
    throw new Error(
      `Install ${packageName} so \`${commandName}\` is on PATH. This script only installs it with apt on Linux.`,
    );
  process.stderr.write(`Installing ${packageName}\n`);
  await execFileAsync("sudo", ["apt-get", "install", "-y", packageName]);
  const installed = await whichCommand(commandName);
  if (installed === undefined)
    throw new Error(`${packageName} did not provide ${commandName}`);
  return installed;
};

const linkOnPath = async (target, name) => {
  const localBin = join(process.env.HOME ?? ".", ".local", "bin");
  await mkdir(localBin, { recursive: true });
  const destination = join(localBin, name);
  try {
    if ((await lstat(destination)).isSymbolicLink()) await rm(destination);
  } catch (cause) {
    if (cause?.code !== "ENOENT") throw cause;
  }
  await symlink(target, destination);
  try {
    await execFileAsync("sudo", [
      "ln",
      "-sfn",
      target,
      `/usr/local/bin/${name}`,
    ]);
  } catch {
    process.stderr.write(
      `Could not link /usr/local/bin/${name}. Add ${localBin} to PATH.\n`,
    );
  }
  return destination;
};

const commandMatches = async (path, args, expected) => {
  try {
    return (await commandOutput(path, args)).includes(expected);
  } catch (cause) {
    if (cause instanceof Error) return false;
    throw cause;
  }
};

const installJadxCli = async (rootDir) => {
  const jadxRoot = join(rootDir, "jadx");
  await mkdir(jadxRoot, { recursive: true });
  const candidates = [
    join(jadxRoot, "bin", "jadx"),
    join(jadxRoot, "unpack", "bin", "jadx"),
  ];
  for (const candidate of candidates) {
    if (
      await commandMatches(candidate, ["--version"], JADX_CLI_RELEASE.version)
    )
      return candidate;
  }
  const archive = join(jadxRoot, JADX_CLI_RELEASE.filename);
  process.stderr.write(`Downloading ${JADX_CLI_RELEASE.url}\n`);
  await downloadVerified(
    JADX_CLI_RELEASE.url,
    archive,
    JADX_CLI_RELEASE.sha256,
  );
  await execFileAsync("unzip", [
    "-qo",
    archive,
    "-d",
    join(jadxRoot, "unpack"),
  ]);
  const binary = join(jadxRoot, "unpack", "bin", "jadx");
  if (!(await commandMatches(binary, ["--version"], JADX_CLI_RELEASE.version)))
    throw new Error(`jadx ${JADX_CLI_RELEASE.version} did not extract`);
  return binary;
};

const installRizin = async (rootDir) => {
  if (process.platform !== "linux" || process.arch !== "x64")
    throw new Error(
      `Install Rizin ${RIZIN_RELEASE.version} from ${RIZIN_RELEASE.url.replace(RIZIN_RELEASE.filename, "")} for this platform. The pinned archive is the Linux x64 static build.`,
    );
  const rizinRoot = join(rootDir, "rizin");
  await mkdir(rizinRoot, { recursive: true });
  const binary = join(rizinRoot, "bin", "rizin");
  if (await commandMatches(binary, ["-v"], RIZIN_RELEASE.version))
    return binary;
  const archive = join(rizinRoot, RIZIN_RELEASE.filename);
  process.stderr.write(`Downloading ${RIZIN_RELEASE.url}\n`);
  await downloadVerified(RIZIN_RELEASE.url, archive, RIZIN_RELEASE.sha256);
  await execFileAsync("tar", ["-xJf", archive, "-C", rizinRoot]);
  if (!(await commandMatches(binary, ["-v"], RIZIN_RELEASE.version)))
    throw new Error(`Rizin ${RIZIN_RELEASE.version} did not extract`);
  return binary;
};

const installPythonCompanions = async (rootDir) => {
  const venv = join(rootDir, "venv");
  const python = join(venv, "bin", "python");
  try {
    await access(python, constants.X_OK);
  } catch (cause) {
    if (cause?.code !== "ENOENT") throw cause;
    await execFileAsync("python3", ["-m", "venv", venv]);
  }
  await execFileAsync(python, [
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    `frida==${FRIDA_TOOLS.frida}`,
    `frida-tools==${FRIDA_TOOLS.tools}`,
    GHIDRA_MCP_RELEASE.pip,
  ]);
  return {
    frida: join(venv, "bin", "frida"),
    ghidraMcp: join(venv, "bin", "ghidra-mcp"),
  };
};

const installGhidraMcpExtension = async (rootDir) => {
  const mcpRoot = join(rootDir, "ghidra-mcp");
  await mkdir(mcpRoot, { recursive: true });
  const archive = join(mcpRoot, GHIDRA_MCP_RELEASE.filename);
  let digest;
  try {
    digest = await hashFile(archive);
  } catch (cause) {
    if (cause?.code !== "ENOENT") throw cause;
    digest = undefined;
  }
  if (digest !== GHIDRA_MCP_RELEASE.sha256) {
    process.stderr.write(`Downloading ${GHIDRA_MCP_RELEASE.url}\n`);
    await downloadVerified(
      GHIDRA_MCP_RELEASE.url,
      archive,
      GHIDRA_MCP_RELEASE.sha256,
    );
  }
  await execFileAsync("unzip", ["-qo", archive, "-d", mcpRoot]);
  const extension = join(
    mcpRoot,
    "GhidraMCP-release-2-0",
    GHIDRA_MCP_RELEASE.extensionName,
  );
  await access(extension, constants.R_OK);
  return extension;
};

const javaHome = await requireFullJdk();
const toolsRoot = destinationRoot();
const ghidraDir = await installGhidra(toolsRoot);
const { jar, apk } = await installAndroidSamples(toolsRoot);
const jadxCli = await installJadxCli(toolsRoot);
const rizin = await installRizin(toolsRoot);
const objdump = await ensureDebianPackage("objdump", "binutils");
const gdb = await ensureDebianPackage("gdb", "gdb");
const pythonTools = await installPythonCompanions(toolsRoot);
const ghidraMcpExtension = await installGhidraMcpExtension(toolsRoot);
await linkOnPath(jadxCli, "jadx");
await linkOnPath(rizin, "rizin");
await linkOnPath(pythonTools.frida, "frida");
await linkOnPath(pythonTools.ghidraMcp, "ghidra-mcp");
const envFile = join(toolsRoot, "cursor-engines.env");
const exportLines = [
  `export GHIDRA_INSTALL_DIR=${shellQuote(ghidraDir)}`,
  `export JAVA_HOME=${shellQuote(javaHome)}`,
  `export REA_JADX_MCP_JAR=${shellQuote(jar)}`,
  `export REA_RIZIN_COMMAND=${shellQuote(rizin)}`,
  `export REA_OBJDUMP_COMMAND=${shellQuote(objdump)}`,
  `export REA_GDB_COMMAND=${shellQuote(gdb)}`,
  `export GHIDRA_MCP_BIN=${shellQuote(pythonTools.ghidraMcp)}`,
  `export GHIDRA_MCP_EXTENSION_ZIP=${shellQuote(ghidraMcpExtension)}`,
  `export GHIDRA_MCP_SERVER=${shellQuote("http://127.0.0.1:8080/")}`,
];
const notes = [
  `# Sample APK: ${apk}`,
  `# JADX CLI: ${jadxCli}`,
  `# Frida CLI: ${pythonTools.frida}`,
  "# Paid engines are not installed. Fill these stubs before using them:",
  "# export HOPPER_LAUNCHER_PATH='/absolute/path/to/hopper'",
  "# export REA_IDA_MCP_CONFIG='/absolute/path/to/ida-mcp.json'",
];
await writeFile(envFile, `${exportLines.join("\n")}\n${notes.join("\n")}\n`, {
  mode: 0o644,
});
process.stderr.write(
  `Wrote ${envFile}\nSample APK: ${apk}\nLoad the variables, review setup, then approve it:\n  set -a; . ${envFile}; set +a\n  node scripts/rea.mjs setup --client cursor --dry-run\n  node scripts/rea.mjs setup --client cursor --yes\n`,
);
process.stdout.write(`${exportLines.join("\n")}\n`);
