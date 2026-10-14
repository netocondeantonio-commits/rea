import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  bearerMatches,
  loginAllowed,
  noteLogin,
  parseCookies,
  readSessionToken,
  signSession,
} from "./local-admin-auth.mjs";
import {
  deleteTarget,
  deleteUser,
  getAudit,
  getHome,
  getJob,
  getJobs,
  getSettings,
  getTargets,
  getUsers,
  getZip,
  patchUser,
  postAnalyze,
  postCancel,
  postRerun,
  postTarget,
  postUser,
  putSettings,
} from "./local-admin-actions.mjs";
import { extraRoutes, tryShare } from "./local-admin-extra-routes.mjs";
import { fail, json, readJsonBody, send } from "./local-admin-reply.mjs";
import { safeChildPath } from "./local-analyze-text.mjs";

const SESSION_MS = 12 * 60 * 60 * 1000;

const contentType = (file) => {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".md") || file.endsWith(".txt") || file.endsWith(".mmd"))
    return "text/plain; charset=utf-8";
  return undefined;
};

const identify = (request, admin) => {
  if (bearerMatches(request.headers.authorization, process.env.REA_ADMIN_TOKEN))
    return { user: "api-token", role: "operator" };
  const payload = readSessionToken(
    admin.secret,
    parseCookies(request.headers.cookie).rea_session,
  );
  if (!payload) return undefined;
  const user = admin
    .listUsers()
    .find((item) => item.username === payload.user && !item.disabled);
  if (!user) return undefined;
  return { user: user.username, role: user.role };
};

const postLogin = async (ctx) => {
  const body = await readJsonBody(ctx.request);
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!loginAllowed(username)) {
    fail(
      ctx.response,
      429,
      "Muitas tentativas. Espere um minuto.",
      "Too many attempts. Wait one minute.",
    );
    return;
  }
  const user = await ctx.admin.authenticate(username, password);
  noteLogin(username, user !== undefined);
  if (!user) {
    fail(
      ctx.response,
      401,
      "Usuário ou senha incorretos.",
      "Wrong user or password.",
    );
    return;
  }
  const token = signSession(ctx.admin.secret, {
    user: user.username,
    role: user.role,
    exp: Date.now() + SESSION_MS,
  });
  ctx.response.setHeader(
    "set-cookie",
    `rea_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`,
  );
  await ctx.admin.audit({
    user: user.username,
    action: "login",
    detail: "session",
  });
  json(ctx.response, 200, { user });
};

const postLogout = async (ctx) => {
  ctx.response.setHeader(
    "set-cookie",
    "rea_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
  );
  await ctx.admin.audit({
    user: ctx.actor.user,
    action: "logout",
    detail: "session",
  });
  json(ctx.response, 200, { ok: true });
};

const getMe = async (ctx) => {
  const settings = ctx.admin.readSettings();
  json(ctx.response, 200, {
    user: { username: ctx.actor.user, role: ctx.actor.role },
    settings: { language: settings.language, theme: settings.theme },
  });
};

const ROUTES = [
  { method: "POST", pattern: /^\/api\/logout$/u, role: "any", run: postLogout },
  { method: "GET", pattern: /^\/api\/me$/u, role: "any", run: getMe },
  { method: "GET", pattern: /^\/api\/home$/u, role: "any", run: getHome },
  { method: "GET", pattern: /^\/api\/jobs$/u, role: "any", run: getJobs },
  {
    method: "GET",
    pattern: /^\/api\/jobs\/([A-Za-z0-9-]+)$/u,
    role: "any",
    run: getJob,
  },
  {
    method: "POST",
    pattern: /^\/api\/analyze$/u,
    role: "any",
    run: postAnalyze,
  },
  {
    method: "POST",
    pattern: /^\/api\/jobs\/([A-Za-z0-9-]+)\/cancel$/u,
    role: "any",
    run: postCancel,
  },
  {
    method: "POST",
    pattern: /^\/api\/jobs\/([A-Za-z0-9-]+)\/rerun$/u,
    role: "any",
    run: postRerun,
  },
  {
    method: "GET",
    pattern: /^\/api\/jobs\/([A-Za-z0-9-]+)\/export\.zip$/u,
    role: "any",
    run: getZip,
  },
  { method: "GET", pattern: /^\/api\/targets$/u, role: "any", run: getTargets },
  {
    method: "POST",
    pattern: /^\/api\/targets$/u,
    role: "any",
    run: postTarget,
  },
  {
    method: "DELETE",
    pattern: /^\/api\/targets\/([A-Za-z0-9_-]+)$/u,
    role: "any",
    run: deleteTarget,
  },
  {
    method: "GET",
    pattern: /^\/api\/settings$/u,
    role: "admin",
    run: getSettings,
  },
  {
    method: "PUT",
    pattern: /^\/api\/settings$/u,
    role: "any",
    run: putSettings,
  },
  { method: "GET", pattern: /^\/api\/users$/u, role: "admin", run: getUsers },
  { method: "POST", pattern: /^\/api\/users$/u, role: "admin", run: postUser },
  {
    method: "PATCH",
    pattern: /^\/api\/users\/([A-Za-z0-9._-]+)$/u,
    role: "admin",
    run: patchUser,
  },
  {
    method: "DELETE",
    pattern: /^\/api\/users\/([A-Za-z0-9._-]+)$/u,
    role: "admin",
    run: deleteUser,
  },
  { method: "GET", pattern: /^\/api\/audit$/u, role: "admin", run: getAudit },
  ...extraRoutes,
];

const dispatch = async (ctx, url) => {
  for (const route of ROUTES) {
    if (route.method !== ctx.request.method) continue;
    const match = route.pattern.exec(url.pathname);
    if (match === null) continue;
    if (route.role === "admin" && ctx.actor.role !== "admin") {
      fail(
        ctx.response,
        403,
        "Só um administrador pode fazer isso.",
        "Only an administrator can do that.",
      );
      return true;
    }
    await route.run(ctx, match[1]);
    return true;
  }
  return false;
};

const sendPackage = async (response, job, relative) => {
  if (job?.package_slug === undefined) {
    send(response, 404, "pacote ainda não existe", "text/plain; charset=utf-8");
    return;
  }
  const root = join(job.directory, "output", job.package_slug);
  const file = safeChildPath(root, relative);
  const type = file === undefined ? undefined : contentType(file);
  if (file === undefined || type === undefined) {
    send(response, 404, "não encontrado", "text/plain; charset=utf-8");
    return;
  }
  try {
    send(response, 200, await readFile(file), type);
  } catch {
    send(response, 404, "não encontrado", "text/plain; charset=utf-8");
  }
};

const servePackage = async (ctx, url) => {
  if (ctx.request.method !== "GET") return false;
  const nested = /^\/packages\/([A-Za-z0-9-]+)\/(.+)$/u.exec(url.pathname);
  if (nested !== null) {
    await sendPackage(ctx.response, ctx.jobs.get(nested[1]), nested[2]);
    return true;
  }
  const root = /^\/packages\/([A-Za-z0-9-]+)\/?$/u.exec(url.pathname);
  if (root === null) return false;
  await sendPackage(ctx.response, ctx.jobs.get(root[1]), "index.html");
  return true;
};

const serveReport = async (ctx, url) => {
  const match = /^\/reports\/([A-Za-z0-9-]+)$/u.exec(url.pathname);
  if (ctx.request.method !== "GET" || match === null) return false;
  const job = ctx.jobs.get(match[1]);
  if (!job) {
    send(ctx.response, 404, "não encontrado", "text/plain; charset=utf-8");
    return true;
  }
  try {
    send(
      ctx.response,
      200,
      await readFile(join(job.directory, "report.html")),
      "text/html; charset=utf-8",
    );
  } catch {
    send(
      ctx.response,
      404,
      "relatório ainda não existe",
      "text/plain; charset=utf-8",
    );
  }
  return true;
};

export const handleRequest = async (ctx) => {
  const url = new URL(ctx.request.url ?? "/", "http://127.0.0.1");
  if (ctx.request.method === "GET" && url.pathname === "/favicon.ico") {
    send(ctx.response, 204, "", "text/plain");
    return;
  }
  if (ctx.request.method === "GET" && url.pathname === "/") {
    send(ctx.response, 200, ctx.dashboard, "text/html; charset=utf-8");
    return;
  }
  if (ctx.request.method === "POST" && url.pathname === "/api/login") {
    await postLogin(ctx);
    return;
  }
  if (await tryShare(ctx, url)) return;
  const actor = identify(ctx.request, ctx.admin);
  if (!actor) {
    fail(ctx.response, 401, "Entre para continuar.", "Sign in to continue.");
    return;
  }
  if (await dispatch({ ...ctx, actor }, url)) return;
  if (await servePackage({ ...ctx, actor }, url)) return;
  if (await serveReport({ ...ctx, actor }, url)) return;
  send(ctx.response, 404, "não encontrado", "text/plain; charset=utf-8");
};
