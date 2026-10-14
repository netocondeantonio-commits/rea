import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  link,
  mkdir,
  open,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

/**
 * Download the free analysis engines REA can check, without installing Java,
 * Hopper, or IDA. This is an operator helper. `rea setup` never runs it.
 *
 * Ghidra 12.1.4 asset digest from the NationalSecurityAgency/ghidra release
 * Ghidra_12.1.4_build. JADX and the sample APK stay pinned by
 * scripts/fixtures/android/fetch.mjs.
 */

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

const javaHome = await requireFullJdk();
const toolsRoot = destinationRoot();
const ghidraDir = await installGhidra(toolsRoot);
const { jar, apk } = await installAndroidSamples(toolsRoot);
const envFile = join(toolsRoot, "cursor-engines.env");
const exportLines = [
  `export GHIDRA_INSTALL_DIR=${shellQuote(ghidraDir)}`,
  `export JAVA_HOME=${shellQuote(javaHome)}`,
  `export REA_JADX_MCP_JAR=${shellQuote(jar)}`,
];
await writeFile(envFile, `${exportLines.join("\n")}\n# Sample APK: ${apk}\n`, {
  mode: 0o644,
});
process.stderr.write(
  `Wrote ${envFile}\nSample APK: ${apk}\nLoad the variables, review setup, then approve it:\n  set -a; . ${envFile}; set +a\n  node scripts/rea.mjs setup --client cursor --dry-run\n  node scripts/rea.mjs setup --client cursor --yes\n`,
);
process.stdout.write(`${exportLines.join("\n")}\n`);
