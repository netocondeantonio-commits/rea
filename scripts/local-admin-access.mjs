import { isIP } from "node:net";
import { resolve } from "node:path";
import { randomPassword } from "./local-admin-auth.mjs";
import { pinnedDigest } from "./local-admin-pins.mjs";
import { fail } from "./local-admin-reply.mjs";

/** Request guards for the admin page. No billing and no new accounts of record. */

const windows = new Map();
const GITHUB =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?(?:\.git)?\/?$/u;

const ipv4Private = (value) => {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return a === 100 && b >= 64 && b <= 127;
};

const ipv6Private = (value) => {
  const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(value);
  if (mapped) return ipv4Private(mapped[1]);
  return (
    value === "::1" ||
    value === "::" ||
    value.startsWith("fe80:") ||
    value.startsWith("fc") ||
    value.startsWith("fd")
  );
};

export const isPrivateAddress = (raw) => {
  let value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);
  if (isIP(value) === 4) return ipv4Private(value);
  if (isIP(value) === 6) return ipv6Private(value);
  return false;
};

const blockedHost = (host) =>
  host === "localhost" ||
  host.endsWith(".localhost") ||
  host.endsWith(".local") ||
  host.endsWith(".internal") ||
  host === "metadata.google.internal";

export const publicHttpUrl = (raw) => {
  let url;
  try {
    url = new URL(String(raw ?? ""));
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (url.username.length > 0 || url.password.length > 0) return undefined;
  const host = url.hostname.toLowerCase();
  if (blockedHost(host)) return undefined;
  if (isIP(host) !== 0 && isPrivateAddress(host)) return undefined;
  if (url.toString().length > 500) return undefined;
  return url;
};

const dotted = (value) => {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every(
    (part) =>
      /^\d{1,3}$/u.test(part) && Number(part) >= 0 && Number(part) <= 255,
  );
};

export const bindAddress = (host, port) => {
  const name = String(host ?? "").trim() || "127.0.0.1";
  const number = Number(port);
  if (!Number.isInteger(number) || number < 0 || number > 65535)
    return { error: "Porta inválida." };
  if (number === 80 || number === 443)
    return { error: "As portas 80 e 443 ficam com o proxy." };
  const allowed =
    name === "127.0.0.1" ||
    name === "0.0.0.0" ||
    name === "::1" ||
    name === "::" ||
    dotted(name);
  if (!allowed) return { error: "Endereço de escuta inválido." };
  return { host: name, port: number };
};

export const canSeeJob = (actor, job) => {
  if (!actor || !job) return false;
  if (actor.role === "admin") return true;
  return typeof job.user === "string" && job.user === actor.user;
};

export const canSeeTarget = (actor, target) => {
  if (!actor || !target) return false;
  if (actor.role === "admin") return true;
  if (target.owner === "shared") return true;
  return typeof target.owner === "string" && target.owner === actor.user;
};

export const targetWrite = (actor, target) => {
  if (!canSeeTarget(actor, target)) return "missing";
  if (target.owner === "shared" && actor.role !== "admin") return "forbidden";
  return "ok";
};

export const guardJobs = (jobs, actor) => ({
  get: (id) => {
    const job = jobs.get(id);
    return job && canSeeJob(actor, job) ? job : undefined;
  },
  has: (id) => {
    const job = jobs.get(id);
    return Boolean(job && canSeeJob(actor, job));
  },
  values: () => [...jobs.values()].filter((job) => canSeeJob(actor, job)),
  set: (id, job) => jobs.set(id, job),
});

export const allowRequest = (key, limit, windowMs, now = Date.now()) => {
  const row = windows.get(key);
  if (!row || now >= row.until) {
    if (windows.size > 1000) windows.clear();
    windows.set(key, { count: 1, until: now + windowMs });
    return true;
  }
  if (row.count >= limit) return false;
  row.count += 1;
  return true;
};

export const resetLimits = () => {
  windows.clear();
};

export const clientAddress = (request) => {
  if (process.env.REA_TRUST_PROXY === "1") {
    const forwarded = String(request.headers?.["x-forwarded-for"] ?? "")
      .split(",")[0]
      .trim();
    if (forwarded.length > 0) return forwarded.slice(0, 80);
  }
  return String(request.socket?.remoteAddress ?? "local").slice(0, 80);
};

export const demoAllowsTarget = (target, uploadRoot) => {
  if (process.env.REA_DEMO !== "1") return true;
  const value = String(target ?? "").trim();
  if (pinnedDigest(value) !== undefined) return true;
  if (GITHUB.test(value)) return true;
  if (typeof uploadRoot !== "string" || uploadRoot.length === 0) return false;
  const root = resolve(uploadRoot);
  const path = resolve(value);
  return path === root || path.startsWith(`${root}/`);
};

export const applySecurityHeaders = (response) => {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.setHeader(
    "content-security-policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'",
  );
};

export const corsHeaders = (request) => {
  const allowed = process.env.REA_CORS_ORIGIN ?? "";
  const origin = request.headers?.origin;
  if (allowed.length === 0 || origin !== allowed) return {};
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers":
      "authorization, content-type, x-rea-filename",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    vary: "origin",
  };
};

export const prepareHeaders = (ctx) => {
  applySecurityHeaders(ctx.response);
  for (const [key, value] of Object.entries(corsHeaders(ctx.request)))
    ctx.response.setHeader(key, value);
};

const limitedPath = (pathname) =>
  pathname.startsWith("/api/") &&
  pathname !== "/api/health" &&
  pathname !== "/api/openapi.json" &&
  pathname !== "/api/docs";

export const rejectIfLimited = (ctx, pathname) => {
  if (!limitedPath(pathname)) return false;
  const login = pathname === "/api/login";
  const key = `${clientAddress(ctx.request)}:${login ? "login" : "api"}`;
  if (allowRequest(key, login ? 10 : 120, 60_000)) return false;
  ctx.response.setHeader("retry-after", "60");
  fail(
    ctx.response,
    429,
    "Muitos pedidos. Espere um minuto.",
    "Too many requests. Wait one minute.",
  );
  return true;
};

export const ensureDemoUser = async (admin) => {
  if (process.env.REA_DEMO !== "1") return "";
  if (admin.listUsers().some((user) => user.username === "demo")) return "";
  const generated = process.env.REA_DEMO_PASSWORD ?? "";
  const password = generated.length >= 8 ? generated : randomPassword();
  const created = await admin.createUser({
    username: "demo",
    password,
    role: "operator",
  });
  if (created.error || generated.length >= 8) return "";
  return password;
};

export const shownHost = (host) => {
  if (host === "0.0.0.0" || host === "::") return "127.0.0.1";
  return host.includes(":") ? `[${host}]` : host;
};
