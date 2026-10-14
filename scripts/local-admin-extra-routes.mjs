import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { targetWrite } from "./local-admin-access.mjs";
import {
  acceptedEngines,
  diffDirectories,
  searchJobs,
} from "./local-admin-extra.mjs";
import { postUpload } from "./local-admin-upload.mjs";
import {
  renderTemplate,
  shareDocument,
  textToPdf,
} from "./local-admin-report-export.mjs";
import { fail, json, readJsonBody, send } from "./local-admin-reply.mjs";
import { publicJob } from "./local-analyze-jobs.mjs";
import { safeChildPath } from "./local-analyze-text.mjs";

const JOB_FILES = new Set([
  "report.html",
  "report.md",
  "hashes.sha256",
  "checklist.json",
  "signature.txt",
]);

const contentType = (file) => {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".pdf")) return "application/pdf";
  if (file.endsWith(".md") || file.endsWith(".txt") || file.endsWith(".mmd"))
    return "text/plain; charset=utf-8";
  return "application/octet-stream";
};

const audit = (ctx, action, detail) =>
  ctx.admin.audit({ user: ctx.actor.user, action, detail });

const jobById = (ctx, id) => {
  const job = ctx.jobs.get(id);
  if (!job)
    fail(ctx.response, 404, "Análise não encontrada.", "Analysis not found.");
  return job;
};

export const postDiff = async (ctx) => {
  const body = await readJsonBody(ctx.request);
  const left = ctx.jobs.get(body?.left);
  const right = ctx.jobs.get(body?.right);
  if (!left?.directory || !right?.directory) {
    fail(ctx.response, 404, "Análise não encontrada.", "Analysis not found.");
    return;
  }
  json(
    ctx.response,
    200,
    await diffDirectories(left.directory, right.directory),
  );
};

export const getSearch = async (ctx) => {
  const query = new URL(ctx.request.url ?? "/", "http://127.0.0.1").searchParams
    .get("q")
    ?.trim();
  if (!query || query.length < 2 || query.length > 80) {
    fail(
      ctx.response,
      400,
      "A busca precisa de 2 a 80 caracteres.",
      "Search needs 2 to 80 characters.",
    );
    return;
  }
  json(ctx.response, 200, { hits: await searchJobs(ctx.jobs.values(), query) });
};

export const getPdf = async (ctx, id) => {
  const job = jobById(ctx, id);
  if (!job) return;
  const template = new URL(
    ctx.request.url ?? "/",
    "http://127.0.0.1",
  ).searchParams.get("template");
  const name =
    template === "internal" || template === "ctf" ? template : "client";
  const bytes = textToPdf(`REA ${name}`, renderTemplate(name, publicJob(job)));
  ctx.response.writeHead(200, {
    "content-type": "application/pdf",
    "content-disposition": `attachment; filename="rea-${id}-${name}.pdf"`,
    "cache-control": "no-store",
  });
  ctx.response.end(bytes);
};

export const postShare = async (ctx, id) => {
  const job = jobById(ctx, id);
  if (!job) return;
  if (!ctx.shares) {
    fail(ctx.response, 404, "Link não encontrado.", "Link not found.");
    return;
  }
  const share = await ctx.shares.create(job.id);
  await audit(ctx, "share.create", job.id);
  json(ctx.response, 201, {
    token: share.token,
    path: `/r/${share.token}`,
    expiresAt: new Date(share.exp).toISOString(),
    loopbackOnly:
      ctx.options.host === undefined ||
      ctx.options.host === "127.0.0.1" ||
      ctx.options.host === "::1",
  });
};

export const deleteShare = async (ctx, token) => {
  if (!ctx.shares) {
    fail(ctx.response, 404, "Link não encontrado.", "Link not found.");
    return;
  }
  await ctx.shares.revoke(token);
  await audit(ctx, "share.revoke", "token");
  json(ctx.response, 200, { ok: true });
};

export const getEngines = async (ctx) => {
  json(ctx.response, 200, {
    engines: acceptedEngines(ctx.admin.readSettings()),
  });
};

export const postEngines = async (ctx) => {
  const body = await readJsonBody(ctx.request);
  if (!body) {
    fail(ctx.response, 400, "JSON inválido.", "Invalid JSON.");
    return;
  }
  const engines = acceptedEngines(body);
  const settings = await ctx.admin.writeSettings({ engines }, "admin");
  await audit(ctx, "engines.import", "engine keys only");
  json(ctx.response, 200, { engines: settings.engines });
};

export const patchTarget = async (ctx, id) => {
  const body = await readJsonBody(ctx.request);
  if (!body) {
    fail(ctx.response, 400, "JSON inválido.", "Invalid JSON.");
    return;
  }
  const current = ctx.admin.listTargets().find((item) => item.id === id);
  const access = targetWrite(ctx.actor, current);
  if (access === "missing") {
    fail(ctx.response, 404, "Alvo não encontrado.", "Target not found.");
    return;
  }
  if (access === "forbidden") {
    fail(
      ctx.response,
      403,
      "Só um administrador altera um alvo compartilhado.",
      "Only an administrator can change a shared target.",
    );
    return;
  }
  const result = await ctx.admin.patchTarget(id, body);
  if (result.error) {
    fail(ctx.response, 400, result.error, result.error_en ?? result.error);
    return;
  }
  await audit(ctx, "target.schedule", id);
  json(ctx.response, 200, result.target);
};

export const extraRoutes = [
  { method: "POST", pattern: /^\/api\/upload$/u, role: "any", run: postUpload },
  { method: "POST", pattern: /^\/api\/diff$/u, role: "any", run: postDiff },
  { method: "GET", pattern: /^\/api\/search$/u, role: "any", run: getSearch },
  {
    method: "GET",
    pattern: /^\/api\/jobs\/([A-Za-z0-9-]+)\/report\.pdf$/u,
    role: "any",
    run: getPdf,
  },
  {
    method: "POST",
    pattern: /^\/api\/jobs\/([A-Za-z0-9-]+)\/share$/u,
    role: "any",
    run: postShare,
  },
  {
    method: "DELETE",
    pattern: /^\/api\/shares\/([A-Za-z0-9_-]{20,128})$/u,
    role: "any",
    run: deleteShare,
  },
  {
    method: "GET",
    pattern: /^\/api\/settings\/engines$/u,
    role: "admin",
    run: getEngines,
  },
  {
    method: "POST",
    pattern: /^\/api\/settings\/engines$/u,
    role: "admin",
    run: postEngines,
  },
  {
    method: "PATCH",
    pattern: /^\/api\/targets\/([A-Za-z0-9_-]+)$/u,
    role: "any",
    run: patchTarget,
  },
];

const readShared = async (response, file) => {
  try {
    send(response, 200, await readFile(file), contentType(file));
  } catch {
    send(response, 404, "não encontrado", "text/plain; charset=utf-8");
  }
};

const fileExists = async (file) => {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
};

const sendSharedFile = async (response, job, relativePath) => {
  const packageRoot =
    job.package_slug === undefined
      ? undefined
      : join(job.directory, "output", job.package_slug);
  const packaged =
    packageRoot === undefined
      ? undefined
      : safeChildPath(packageRoot, relativePath);
  if (packaged !== undefined && (await fileExists(packaged))) {
    await readShared(response, packaged);
    return;
  }
  if (JOB_FILES.has(relativePath)) {
    await readShared(response, join(job.directory, relativePath));
    return;
  }
  send(response, 404, "não encontrado", "text/plain; charset=utf-8");
};

export const tryShare = async (ctx, url) => {
  if (ctx.request.method !== "GET") return false;
  const file = /^\/r\/([A-Za-z0-9_-]{20,128})\/pkg\/(.+)$/u.exec(url.pathname);
  const page = /^\/r\/([A-Za-z0-9_-]{20,128})\/?$/u.exec(url.pathname);
  if (file === null && page === null) return false;
  const share = ctx.shares?.lookup((file ?? page)[1]);
  const job = share ? ctx.jobs.get(share.jobId) : undefined;
  if (!share || !job) {
    send(ctx.response, 404, "não encontrado", "text/plain; charset=utf-8");
    return true;
  }
  if (file) await sendSharedFile(ctx.response, job, file[2]);
  else
    send(
      ctx.response,
      200,
      shareDocument(publicJob(job), share.token),
      "text/html; charset=utf-8",
    );
  return true;
};
