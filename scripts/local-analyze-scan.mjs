import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { promisify } from "node:util";

/** Bounded local reads. These scans do not run the target and do not use a model. */

const execFileAsync = promisify(execFile);
const SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  "vendor",
  "__pycache__",
  ".gradle",
  "out",
]);
const TEXT_EXT = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".go",
  ".java",
  ".kt",
  ".cs",
  ".php",
  ".rb",
  ".html",
]);
const FILE_CAP = 250;
const HTTP_CAP = 40;
const STRING_CAP = 60;
const BYTE_CAP = 200_000;

const ROUTE_PATTERNS = [
  /\b(?:app|router|server)\.(get|post|put|patch|delete|options|head)\(\s*['"]([^'"]+)['"]/giu,
  /@(?:app|router)\.(get|post|put|patch|delete|route)\(\s*['"]([^'"]+)['"]/giu,
  /@(Get|Post|Put|Patch|Delete|Head|Options)Mapping\(\s*(?:value\s*=\s*)?['"]([^'"]+)['"]/giu,
  /\[Http(Get|Post|Put|Patch|Delete|Head|Options)(?:\(\s*"([^"]*)"\s*\))?\]/giu,
  /\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\(\s*"([^"]+)"/gu,
];

const URL_PATTERN = /https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]{4,160}/gu;
const STRING_PATTERN = /['"]([A-Za-z][^'"\n]{5,80})['"]/gu;

const readable = async (path) => {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch (cause) {
    if (cause?.code === "ENOENT") return false;
    throw cause;
  }
};

const emptyScan = () => ({
  http: [],
  urls: [],
  strings: [],
  filesRead: 0,
  capped: false,
});

const pushRoute = (http, route) => {
  if (http.length >= HTTP_CAP) return;
  const key = `${route.method} ${route.path}`;
  if (http.some((item) => `${item.method} ${item.path}` === key)) return;
  http.push(route);
};

const routesOnLine = (line, file, lineNumber, http) => {
  for (const pattern of ROUTE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of line.matchAll(pattern)) {
      const method = String(match[1] ?? "GET").toUpperCase();
      const path = match[2] && match[2].length > 0 ? match[2] : "/";
      if (!path.startsWith("/") && !path.startsWith("http")) continue;
      pushRoute(http, {
        method: method === "ROUTE" ? "GET" : method,
        path: path.slice(0, 180),
        file,
        line: lineNumber,
        origin: "text",
      });
    }
  }
};

const stringsOnLine = (line, file, lineNumber, strings) => {
  if (strings.length >= STRING_CAP) return;
  STRING_PATTERN.lastIndex = 0;
  for (const match of line.matchAll(STRING_PATTERN)) {
    strings.push({ value: match[1], file, line: lineNumber });
    if (strings.length >= STRING_CAP) return;
  }
};

const urlsOnLine = (line, file, lineNumber, urls) => {
  if (urls.length >= 20) return;
  URL_PATTERN.lastIndex = 0;
  for (const match of line.matchAll(URL_PATTERN)) {
    urls.push({ url: match[0], file, line: lineNumber });
    if (urls.length >= 20) return;
  }
};

const readOne = async (path, root, scan) => {
  const info = await stat(path);
  if (!info.isFile() || info.size > BYTE_CAP) return;
  const text = await readFile(path, "utf8");
  const file = relative(root, path) || basename(path);
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    routesOnLine(lines[index], file, lineNumber, scan.http);
    urlsOnLine(lines[index], file, lineNumber, scan.urls);
    stringsOnLine(lines[index], file, lineNumber, scan.strings);
  }
};

const considerFile = async (path, root, scan) => {
  if (scan.filesRead >= FILE_CAP) {
    scan.capped = true;
    return;
  }
  if (!TEXT_EXT.has(extname(path).toLowerCase())) return;
  scan.filesRead += 1;
  try {
    await readOne(path, root, scan);
  } catch {
    return;
  }
};

const walk = async (root, scan) => {
  const queue = [root];
  while (queue.length > 0 && scan.filesRead < FILE_CAP) {
    const directory = queue.shift();
    let entries = [];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) queue.push(path);
        continue;
      }
      if (entry.isFile()) await considerFile(path, root, scan);
    }
  }
};

export const scanSource = async (source) => {
  if (typeof source !== "string" || !(await readable(source)))
    return emptyScan();
  const info = await stat(source);
  const scan = emptyScan();
  if (info.isDirectory()) await walk(source, scan);
  else await considerFile(source, source, scan);
  return scan;
};

const stringField = (value) => (typeof value === "string" ? value : "");

const nameList = (value, cap) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const rows = [];
  for (const [name, version] of Object.entries(value)) {
    const suffix = typeof version === "string" ? `@${version}` : "";
    rows.push(`${name}${suffix}`.slice(0, 80));
    if (rows.length >= cap) break;
  }
  return rows;
};

export const readPackageManifest = async (source) => {
  if (typeof source !== "string") return null;
  const info = await stat(source).catch(() => undefined);
  if (!info?.isDirectory()) return null;
  const path = join(source, "package.json");
  if (!(await readable(path))) return null;
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return { invalid: true };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return { invalid: true };
  const scripts =
    parsed.scripts && typeof parsed.scripts === "object" ? parsed.scripts : {};
  const scriptRows = [];
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command === "string")
      scriptRows.push({ name, command: command.slice(0, 180) });
  }
  return {
    invalid: false,
    name: stringField(parsed.name),
    version: stringField(parsed.version),
    description: stringField(parsed.description),
    main: stringField(parsed.main),
    scripts: scriptRows.slice(0, 12),
    dependencies: nameList(parsed.dependencies, 24),
    devDependencies: nameList(parsed.devDependencies, 24),
  };
};

export const readBinaryStrings = async (file, commandExists) => {
  if (typeof file !== "string" || typeof commandExists !== "function")
    return [];
  const info = await stat(file).catch(() => undefined);
  if (!info?.isFile() || !(await commandExists("strings"))) return [];
  try {
    const { stdout } = await execFileAsync("strings", ["-a", "-n", "6", file], {
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length >= 6 && line.length <= 120)
      .slice(0, STRING_CAP);
  } catch {
    return [];
  }
};

const PATH_PATTERN = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/{}-]*$/u;

export const openApiDocument = (matches, name) => {
  const paths = {};
  for (const route of matches) {
    if (!route.path.startsWith("/") || route.path.startsWith("//")) continue;
    const path = route.path.split("?")[0];
    if (!PATH_PATTERN.test(path)) continue;
    const method = route.method.toLowerCase();
    if (
      !["get", "post", "put", "patch", "delete", "head", "options"].includes(
        method,
      )
    )
      continue;
    paths[path] ??= {};
    if (paths[path][method]) continue;
    const where = route.line ? `${route.file}:${route.line}` : route.file;
    paths[path][method] = {
      summary: `Text match in ${where}`,
      description:
        "Copied from local text or engine JSON. No request was sent. This is not proof the route is live.",
      responses: { default: { description: "No response was observed." } },
    };
  }
  const discovered = Object.keys(paths).length > 0;
  return {
    openapi: "3.0.3",
    info: {
      title: discovered ? `${name} text matches` : "No HTTP API was discovered",
      version: "0.0.0",
      description: discovered
        ? "Rotas copiadas de texto local ou do JSON do motor. Nenhuma requisição foi enviada. Paths were copied from local text or engine JSON. No request was sent."
        : "Nenhuma rota HTTP foi encontrada nos arquivos lidos nem na evidência. No HTTP route was found in the files that were read or in the evidence.",
    },
    paths,
  };
};
