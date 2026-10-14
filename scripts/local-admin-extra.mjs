import { createHash, createHmac } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { ENGINE_KEYS } from "./local-admin-store.mjs";

/** Local evidence helpers. No model, and no claim that a target is safe. */

const SKIP_DIRS = new Set(["node_modules", ".git"]);
const TEXT_EXT = new Set([".txt", ".json", ".md"]);
const FAST_SKIP =
  "Modo rápido cobre só JavaScript e site estático. Este alvo não entra nesse modo, e Ghidra/JADX não são chamados.";

const rankOf = (entry) => {
  const value = Number(entry?.job?.priority);
  return value === -1 || value === 1 ? value : 0;
};

export const takeHighest = (waiting) => {
  let best = 0;
  for (let index = 1; index < waiting.length; index += 1) {
    if (rankOf(waiting[index]) > rankOf(waiting[best])) best = index;
  }
  return waiting.splice(best, 1)[0];
};

export const gateFast = (fast, kind) => {
  if (fast !== true) return { usePlan: true, skip: "" };
  if (kind === "javascript" || kind === "website")
    return { usePlan: true, skip: "" };
  return { usePlan: false, skip: FAST_SKIP };
};

export const isDue = (target, now, busy) => {
  const minutes = target?.everyMinutes;
  if (!Number.isInteger(minutes) || minutes < 15) return false;
  if (busy) return false;
  if (typeof target.nextRun !== "string" || target.nextRun.length === 0)
    return true;
  const time = Date.parse(target.nextRun);
  return Number.isFinite(time) && time <= now;
};

export const acceptedEngines = (input) => {
  const source =
    input?.engines && typeof input.engines === "object" ? input.engines : input;
  const engines = {};
  for (const key of ENGINE_KEYS) {
    const field = source?.[key];
    engines[key] = typeof field === "string" ? field.trim().slice(0, 400) : "";
  }
  return engines;
};

const visitFiles = async (dir, state) => {
  if (state.found.length >= state.limit) return;
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (state.found.length >= state.limit) return;
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await visitFiles(path, state);
    else if (entry.isFile() && state.accept(entry.name)) state.found.push(path);
  }
};

const listFiles = async (root, accept, limit) => {
  const state = { found: [], limit, accept };
  await visitFiles(root, state);
  return state.found;
};

const readOptional = async (path) => {
  try {
    return await readFile(path, "utf8");
  } catch (cause) {
    if (cause?.code === "ENOENT") return "";
    throw cause;
  }
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const writeHashes = async (directory, secret) => {
  const files = await listFiles(
    directory,
    (name) => name !== "hashes.sha256" && name !== "signature.txt",
    200,
  );
  const lines = [];
  for (const file of files.sort()) {
    const info = await stat(file);
    if (info.size > 1_048_576) continue;
    const name = relative(directory, file).split(sep).join("/");
    lines.push(`${sha256(await readFile(file))}  ${name}`);
  }
  const body = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  await writeFile(join(directory, "hashes.sha256"), body);
  const digest = sha256(body);
  let signature = "";
  if (typeof secret === "string" && secret.length >= 16 && body.length > 0) {
    signature = createHmac("sha256", secret).update(body).digest("hex");
    await writeFile(
      join(directory, "signature.txt"),
      `local-integrity-tag\nThis HMAC-SHA256 covers hashes.sha256 with the local admin secret.\nIt is not a public code-signing certificate.\n${signature}\n`,
    );
  }
  return { digest, signature };
};

const light = (items, row) => {
  items.push(row);
};

const stepLights = (steps) => {
  const items = [];
  const list = Array.isArray(steps) ? steps : [];
  const failed = list.filter(
    (step) => step?.ok === false && step.skip === undefined,
  );
  const passed = list.filter((step) => step?.ok === true);
  const skipped = list.filter((step) => typeof step?.skip === "string");
  if (failed.length > 0)
    light(items, {
      id: "engine-failed",
      status: "red",
      observation: `${failed.length} etapa(s) do motor falharam.`,
      observation_en: `${failed.length} engine step(s) failed.`,
    });
  else if (passed.length > 0)
    light(items, {
      id: "engine-ok",
      status: "green",
      observation: `${passed.length} etapa(s) do motor terminaram.`,
      observation_en: `${passed.length} engine step(s) finished.`,
    });
  else
    light(items, {
      id: "engine-none",
      status: "amber",
      observation: "Nenhuma etapa do motor terminou.",
      observation_en: "No engine step finished.",
    });
  if (skipped.length > 0)
    light(items, {
      id: "engine-skipped",
      status: "amber",
      observation: `${skipped.length} etapa(s) puladas. O texto está no registro.`,
      observation_en: `${skipped.length} step(s) were skipped. The text is in the log.`,
    });
  const facts = list.flatMap((step) =>
    Array.isArray(step?.facts) ? step.facts : [],
  );
  if (facts.some((fact) => /limitações registradas: [1-9]/u.test(String(fact))))
    light(items, {
      id: "limitations",
      status: "amber",
      observation: "O motor registrou limitações.",
      observation_en: "The engine recorded limitations.",
    });
  return items;
};

const unique = (values) => [...new Set(values)];

const copiedLights = (text) => {
  const items = [];
  const source = String(text ?? "");
  const permissions = unique(
    [...source.matchAll(/android\.permission\.[A-Za-z0-9_.]+/gu)].map(
      (match) => match[0],
    ),
  ).slice(0, 12);
  if (permissions.length > 0)
    light(items, {
      id: "android-permissions",
      status: "amber",
      observation: `Permissões Android copiadas do texto, sem julgamento: ${permissions.join(", ")}.`,
      observation_en: `Android permission names copied from text, not judged: ${permissions.join(", ")}.`,
    });
  const httpCount = source.match(/http:\/\/[^\s"'<>]+/gu)?.length ?? 0;
  if (httpCount > 0)
    light(items, {
      id: "http-literals",
      status: "amber",
      observation: `${httpCount} URL(s) http:// copiadas do texto. Nenhuma requisição foi enviada.`,
      observation_en: `${httpCount} http:// URL(s) copied from text. No request was sent.`,
    });
  const routes = routesFrom(source).slice(0, 12);
  if (routes.length > 0)
    light(items, {
      id: "routes",
      status: "amber",
      observation: `Rotas copiadas do texto: ${routes.join(", ")}.`,
      observation_en: `Routes copied from text: ${routes.join(", ")}.`,
    });
  return items;
};

const routesFrom = (text) => {
  const routes = [];
  for (const chunk of String(text).split("\n---\n")) {
    if (!chunk.includes('"paths"')) continue;
    try {
      const paths = JSON.parse(chunk)?.paths;
      if (paths && typeof paths === "object")
        routes.push(...Object.keys(paths));
    } catch {
      /* a scanned file was not one JSON document */
    }
  }
  return unique(routes);
};

const CERT_EN =
  "This is not an OWASP certificate and does not mean the program is safe.";
const CERT_PT =
  "Isto não é um certificado OWASP e não significa que o programa é seguro.";

export const buildChecklist = (job, text) => ({
  disclaimer: CERT_EN,
  disclaimer_pt: CERT_PT,
  items: [
    ...stepLights(job?.steps),
    ...copiedLights(text),
    {
      id: "not-a-certificate",
      status: "amber",
      observation: CERT_PT,
      observation_en: CERT_EN,
    },
  ],
});

const evidenceText = async (directory) => {
  const files = await listFiles(
    directory,
    (name) => TEXT_EXT.has(name.slice(name.lastIndexOf("."))),
    80,
  );
  const chunks = [];
  for (const file of files) {
    if (chunks.length >= 8) break;
    const info = await stat(file);
    if (info.size > 65_536) continue;
    const name = relative(directory, file).split(sep).join("/");
    if (name === "hashes.sha256" || name === "signature.txt") continue;
    chunks.push(`${name}\n${await readFile(file, "utf8")}`);
  }
  return chunks.join("\n---\n");
};

export const attachEvidence = async (directory, job, secret) => {
  const checklist = buildChecklist(job, await evidenceText(directory));
  await writeFile(
    join(directory, "checklist.json"),
    `${JSON.stringify(checklist, null, 2)}\n`,
  );
  const hashes = await writeHashes(directory, secret);
  return { ...hashes, checklist };
};

export const diffSets = (leftText, rightText, cap = 40) => {
  const left = new Set(
    String(leftText ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
  const right = new Set(
    String(rightText ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
  const added = [];
  const removed = [];
  for (const line of right) {
    if (!left.has(line) && added.length < cap) added.push(line);
  }
  for (const line of left) {
    if (!right.has(line) && removed.length < cap) removed.push(line);
  }
  return { added, removed, leftCount: left.size, rightCount: right.size };
};

const namedText = async (directory, name) => {
  const files = await listFiles(directory, (entry) => entry === name, 400);
  return files.length > 0 ? readOptional(files[0]) : "";
};

const pathLines = (text) => {
  try {
    const paths = JSON.parse(text)?.paths;
    if (!paths || typeof paths !== "object") return "";
    return Object.keys(paths).sort().join("\n");
  } catch {
    return "";
  }
};

export const diffDirectories = async (leftDir, rightDir) => ({
  hashes: diffSets(
    await readOptional(join(leftDir, "hashes.sha256")),
    await readOptional(join(rightDir, "hashes.sha256")),
  ),
  strings: diffSets(
    await namedText(leftDir, "strings.txt"),
    await namedText(rightDir, "strings.txt"),
  ),
  routes: diffSets(
    pathLines(await namedText(leftDir, "openapi.json")),
    pathLines(await namedText(rightDir, "openapi.json")),
  ),
});

const lineHits = (text, needle, hits, room) => {
  const lines = text.split("\n");
  for (let index = 0; index < lines.length && hits.length < room; index += 1) {
    if (lines[index].toLowerCase().includes(needle))
      hits.push({ line: index + 1, text: lines[index].slice(0, 180) });
  }
};

export const searchJobs = async (jobs, query) => {
  const needle = query.toLowerCase();
  const hits = [];
  for (const job of jobs) {
    if (hits.length >= 40 || typeof job?.directory !== "string") continue;
    const files = await listFiles(
      job.directory,
      (name) => TEXT_EXT.has(name.slice(name.lastIndexOf("."))),
      80,
    );
    for (const file of files) {
      if (hits.length >= 40) break;
      const info = await stat(file);
      if (info.size > 262_144) continue;
      const before = hits.length;
      lineHits(await readFile(file, "utf8"), needle, hits, 40);
      for (let index = before; index < hits.length; index += 1) {
        hits[index] = {
          jobId: job.id,
          file: relative(job.directory, file).split(sep).join("/"),
          line: hits[index].line,
          text: hits[index].text,
        };
      }
    }
  }
  return hits;
};
