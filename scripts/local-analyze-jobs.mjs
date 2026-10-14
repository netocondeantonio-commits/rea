import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** In-memory queue and the on-disk job index. One analysis runs at a time. */

const KINDS = new Set([
  "auto",
  "javascript",
  "android",
  "native",
  "website",
  "dotnet",
]);
const JOB_KEYS = [
  "id",
  "target",
  "kind",
  "user",
  "createdAt",
  "state",
  "detected",
  "resolved",
  "directory",
  "events",
  "steps",
  "headline",
  "report_markdown",
  "package_slug",
  "artifacts",
];
const STEP_KEYS = ["id", "title", "ok", "skip", "facts", "stderr"];

let engineEnv = () => ({});
let indexPath = "";
const summaries = new Map();
const waiting = [];
let pumping = false;

export const setEngineEnv = (reader) => {
  engineEnv = reader;
};

export const mergedEnv = () => ({ ...process.env, ...engineEnv() });

export const bindOutput = (output) => {
  indexPath = join(output, "index.json");
};

export const createJob = (output, target, extra = {}) => {
  const id = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  return {
    id,
    target,
    kind: KINDS.has(extra.kind) ? extra.kind : "auto",
    user:
      typeof extra.user === "string" && extra.user.length > 0
        ? extra.user
        : "cli",
    createdAt: new Date().toISOString(),
    state: "queued",
    detected: null,
    directory: join(output, id),
    events: [],
    steps: [],
    headline: "",
    report_markdown: "",
    abort: new AbortController(),
  };
};

const publicStep = (step) => {
  const copy = {};
  for (const key of STEP_KEYS) {
    if (step?.[key] !== undefined) copy[key] = step[key];
  }
  return copy;
};

export const publicJob = (job) => {
  const copy = {};
  for (const key of JOB_KEYS) {
    if (job?.[key] !== undefined) copy[key] = job[key];
  }
  if (Array.isArray(copy.steps)) copy.steps = copy.steps.map(publicStep);
  return copy;
};

const summaryOf = (job) => ({
  id: job.id,
  target: job.target,
  kind: job.kind ?? "auto",
  user: job.user ?? "cli",
  createdAt: job.createdAt ?? "",
  state: job.state,
  detected: job.detected ?? null,
  directory: job.directory,
  headline: job.headline ?? "",
  package_slug: job.package_slug,
});

const writeIndex = async () => {
  if (indexPath.length === 0) return;
  const rows = [...summaries.values()]
    .sort((left, right) =>
      String(right.createdAt).localeCompare(String(left.createdAt)),
    )
    .slice(0, 200);
  await mkdir(join(indexPath, ".."), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify(rows, null, 2)}\n`);
};

export const writeJobFile = async (job) => {
  await mkdir(job.directory, { recursive: true });
  await writeFile(
    join(job.directory, "job.json"),
    `${JSON.stringify(publicJob(job), null, 2)}\n`,
  );
};

export const saveIndex = async (job) => {
  if (indexPath.length === 0 && job?.directory)
    indexPath = join(job.directory, "..", "index.json");
  if (job?.id) summaries.set(job.id, summaryOf(job));
  await writeIndex();
};

const readSavedJob = async (row) => {
  try {
    const saved = JSON.parse(
      await readFile(join(row.directory, "job.json"), "utf8"),
    );
    return saved && typeof saved === "object" ? saved : {};
  } catch (cause) {
    if (cause?.code === "ENOENT") return {};
    throw cause;
  }
};

const reviveJob = async (row) => {
  const saved = await readSavedJob(row);
  const job = {
    ...row,
    ...saved,
    events: Array.isArray(saved.events) ? saved.events : [],
    steps: Array.isArray(saved.steps) ? saved.steps : [],
    abort: new AbortController(),
  };
  if (job.state === "queued" || job.state === "running") {
    job.state = "failed";
    job.events.push({ message: "O processo terminou antes do fim." });
    await writeJobFile(job);
  }
  return job;
};

export const loadHistory = async (output, jobs) => {
  bindOutput(output);
  let rows = [];
  try {
    const parsed = JSON.parse(await readFile(indexPath, "utf8"));
    if (Array.isArray(parsed)) rows = parsed;
  } catch (cause) {
    if (cause?.code !== "ENOENT") throw cause;
  }
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || typeof row.directory !== "string")
      continue;
    if (jobs.has(row.id)) {
      summaries.set(row.id, summaryOf(jobs.get(row.id)));
      continue;
    }
    const job = await reviveJob(row);
    jobs.set(job.id, job);
    summaries.set(job.id, summaryOf(job));
  }
  await writeIndex();
};

const pump = async () => {
  if (pumping) return;
  pumping = true;
  try {
    while (waiting.length > 0) {
      const next = waiting.shift();
      if (next.job.state === "cancelled") continue;
      try {
        await next.analyze(next.job, () => {});
      } catch (cause) {
        if (next.job.state !== "cancelled") {
          next.job.state = "failed";
          next.job.events.push({
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
      await saveIndex(next.job);
    }
  } finally {
    pumping = false;
    if (waiting.length > 0) await pump();
  }
};

export const enqueueJob = (job, analyze) => {
  waiting.push({ job, analyze });
  void pump();
};

export const cancelJob = async (job) => {
  if (job.state !== "queued" && job.state !== "running") return false;
  if (!job.abort) job.abort = new AbortController();
  job.abort.abort();
  job.state = "cancelled";
  if (job.events.at(-1)?.message !== "Cancelado.")
    job.events.push({ message: "Cancelado." });
  await writeJobFile(job);
  await saveIndex(job);
  return true;
};
