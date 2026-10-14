import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { engineStatus } from "./local-admin-status.mjs";
import {
  cancelJob,
  createJob,
  enqueueJob,
  loadHistory,
  publicJob,
  saveIndex,
} from "./local-analyze-jobs.mjs";
import { fail, json, readJsonBody } from "./local-admin-reply.mjs";
import { zipDirectory } from "./local-admin-zip.mjs";

const KINDS = new Set([
  "auto",
  "javascript",
  "android",
  "native",
  "website",
  "dotnet",
]);

const jobsOf = (jobs) =>
  [...jobs.values()]
    .map((job) => publicJob(job))
    .sort((left, right) =>
      String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")),
    );

const outputDir = async (ctx) => {
  await mkdir(ctx.options.output, { recursive: true });
  return ctx.options.output;
};

const audit = (ctx, action, detail) =>
  ctx.admin.audit({ user: ctx.actor.user, action, detail });

const storedError = (response, result) =>
  fail(response, 400, result.error, result.error_en ?? result.error);

export const getHome = async (ctx) => {
  const jobs = jobsOf(ctx.jobs);
  json(ctx.response, 200, {
    engines: await engineStatus(ctx),
    queue: jobs.filter(
      (job) => job.state === "queued" || job.state === "running",
    ),
    recent: jobs.slice(0, 12),
  });
};

export const getJobs = async (ctx) => {
  json(ctx.response, 200, jobsOf(ctx.jobs));
};

export const getJob = async (ctx, id) => {
  const job = ctx.jobs.get(id);
  if (!job) {
    fail(ctx.response, 404, "Análise não encontrada.", "Analysis not found.");
    return;
  }
  json(ctx.response, 200, publicJob(job));
};

export const postAnalyze = async (ctx) => {
  const body = await readJsonBody(ctx.request);
  if (!body) {
    fail(ctx.response, 400, "JSON inválido.", "Invalid JSON.");
    return;
  }
  const target = typeof body.target === "string" ? body.target.trim() : "";
  if (target.length === 0 || target.includes("\0")) {
    fail(
      ctx.response,
      400,
      "Informe um caminho ou uma URL do GitHub.",
      "Enter a path or a GitHub URL.",
    );
    return;
  }
  const kind = KINDS.has(body.kind) ? body.kind : "auto";
  const settings = ctx.admin.readSettings();
  const job = createJob(await outputDir(ctx), target, {
    kind,
    user: ctx.actor.user,
    priority: body.priority,
    fast: body.fast === true,
    cpuNice: settings.cpuNice,
    ramLimitMb: settings.ramLimitMb,
  });
  ctx.jobs.set(job.id, job);
  await saveIndex(job);
  enqueueJob(job, ctx.analyze);
  await audit(ctx, "analyze", `${kind} ${target}`.slice(0, 180));
  json(ctx.response, 202, publicJob(job));
};

export const postCancel = async (ctx, id) => {
  const job = ctx.jobs.get(id);
  if (!job) {
    fail(ctx.response, 404, "Análise não encontrada.", "Analysis not found.");
    return;
  }
  if (!(await cancelJob(job))) {
    fail(
      ctx.response,
      409,
      "Essa análise não está na fila.",
      "That analysis is not queued.",
    );
    return;
  }
  await audit(ctx, "cancel", id);
  json(ctx.response, 200, publicJob(job));
};

export const postRerun = async (ctx, id) => {
  const existing = ctx.jobs.get(id);
  if (!existing) {
    fail(ctx.response, 404, "Análise não encontrada.", "Analysis not found.");
    return;
  }
  const kind = KINDS.has(existing.kind) ? existing.kind : "auto";
  const settings = ctx.admin.readSettings();
  const job = createJob(await outputDir(ctx), existing.target, {
    kind,
    user: ctx.actor.user,
    priority: existing.priority,
    fast: existing.fast === true,
    cpuNice: settings.cpuNice,
    ramLimitMb: settings.ramLimitMb,
  });
  ctx.jobs.set(job.id, job);
  await saveIndex(job);
  enqueueJob(job, ctx.analyze);
  await audit(ctx, "rerun", `${id} -> ${job.id}`);
  json(ctx.response, 202, publicJob(job));
};

export const getZip = async (ctx, id) => {
  const job = ctx.jobs.get(id);
  if (!job) {
    fail(ctx.response, 404, "Análise não encontrada.", "Analysis not found.");
    return;
  }
  try {
    const bytes = await zipDirectory(job.directory);
    ctx.response.writeHead(200, {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="rea-${id}.zip"`,
      "cache-control": "no-store",
    });
    ctx.response.end(bytes);
  } catch {
    fail(
      ctx.response,
      404,
      "Nada para exportar ainda.",
      "Nothing to export yet.",
    );
  }
};

export const getTargets = async (ctx) => {
  json(ctx.response, 200, ctx.admin.listTargets());
};

export const postTarget = async (ctx) => {
  const body = await readJsonBody(ctx.request);
  if (!body) {
    fail(ctx.response, 400, "JSON inválido.", "Invalid JSON.");
    return;
  }
  const result = await ctx.admin.addTarget(body);
  if (result.error) {
    storedError(ctx.response, result);
    return;
  }
  await audit(ctx, "target.add", result.target.target.slice(0, 180));
  json(ctx.response, 201, result.target);
};

export const deleteTarget = async (ctx, id) => {
  await ctx.admin.removeTarget(id);
  await audit(ctx, "target.remove", id);
  json(ctx.response, 200, { ok: true });
};

const applyOutput = async (ctx, folder) => {
  const next = folder.length > 0 ? resolve(folder) : ctx.options.baseOutput;
  await mkdir(next, { recursive: true });
  ctx.options.output = next;
  await loadHistory(next, ctx.jobs);
};

export const getSettings = async (ctx) => {
  const settings = ctx.admin.readSettings();
  json(ctx.response, 200, {
    ...settings,
    effectiveOutput: ctx.options.output,
    tokenConfigured:
      typeof process.env.REA_ADMIN_TOKEN === "string" &&
      process.env.REA_ADMIN_TOKEN.length >= 16,
  });
};

export const putSettings = async (ctx) => {
  const body = await readJsonBody(ctx.request);
  if (!body) {
    fail(ctx.response, 400, "JSON inválido.", "Invalid JSON.");
    return;
  }
  const settings = await ctx.admin.writeSettings(body, ctx.actor.role);
  if (ctx.actor.role === "admin") await applyOutput(ctx, settings.outputDir);
  await audit(ctx, "settings", `${settings.language} ${settings.theme}`);
  json(ctx.response, 200, { ...settings, effectiveOutput: ctx.options.output });
};

export const getUsers = async (ctx) => {
  json(ctx.response, 200, ctx.admin.listUsers());
};

export const postUser = async (ctx) => {
  const body = await readJsonBody(ctx.request);
  if (!body) {
    fail(ctx.response, 400, "JSON inválido.", "Invalid JSON.");
    return;
  }
  const result = await ctx.admin.createUser(body);
  if (result.error) {
    storedError(ctx.response, result);
    return;
  }
  await audit(ctx, "user.create", result.user.username);
  json(ctx.response, 201, result.user);
};

export const patchUser = async (ctx, id) => {
  const body = await readJsonBody(ctx.request);
  if (!body) {
    fail(ctx.response, 400, "JSON inválido.", "Invalid JSON.");
    return;
  }
  const result = await ctx.admin.updateUser(id, body);
  if (result.error) {
    storedError(ctx.response, result);
    return;
  }
  await audit(ctx, "user.update", result.user.username);
  json(ctx.response, 200, result.user);
};

export const deleteUser = async (ctx, id) => {
  const result = await ctx.admin.deleteUser(id);
  if (result.error) {
    storedError(ctx.response, result);
    return;
  }
  await audit(ctx, "user.delete", id);
  json(ctx.response, 200, { ok: true });
};

export const getAudit = async (ctx) => {
  json(ctx.response, 200, await ctx.admin.listAudit());
};
