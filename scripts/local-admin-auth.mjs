import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

/** Local password and session helpers. They never leave this machine. */

const scryptAsync = promisify(scrypt);
const failures = new Map();

export const hashPassword = async (password) => {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 32)).toString("hex");
  return `scrypt$${salt}$${hash}`;
};

export const verifyPassword = async (password, stored) => {
  const [kind, salt, hash] = String(stored ?? "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const actual = await scryptAsync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
};

export const signSession = (secret, payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
};

export const readSessionToken = (secret, token) => {
  const [body, mac] = String(token ?? "").split(".");
  if (!body || !mac) return undefined;
  const expected = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    return undefined;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || typeof payload.user !== "string") return undefined;
    if (typeof payload.exp !== "number" || payload.exp < Date.now())
      return undefined;
    return payload;
  } catch {
    return undefined;
  }
};

const encode = (value) => Buffer.from(value).toString("base64url");

export const signJwt = (secret, payload) => {
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = encode(JSON.stringify(payload));
  const mac = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${mac}`;
};

export const readJwt = (secret, token) => {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) return undefined;
  const [header, body, mac] = parts;
  const expected = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    return undefined;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || typeof payload.user !== "string") return undefined;
    if (typeof payload.exp !== "number" || payload.exp < Date.now())
      return undefined;
    return payload;
  } catch {
    return undefined;
  }
};

export const bearerMatches = (header, token) => {
  if (typeof token !== "string" || token.length < 16) return false;
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(String(header ?? ""));
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
};

export const parseCookies = (header) => {
  const cookies = {};
  for (const part of String(header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(
      part.slice(index + 1).trim(),
    );
  }
  return cookies;
};

export const loginAllowed = (username) => {
  const row = failures.get(username);
  if (!row || Date.now() > row.until) return true;
  return row.count < 8;
};

export const noteLogin = (username, ok) => {
  if (ok) {
    failures.delete(username);
    return;
  }
  const row = failures.get(username) ?? {
    count: 0,
    until: Date.now() + 60_000,
  };
  row.count += 1;
  row.until = Date.now() + 60_000;
  failures.set(username, row);
};

/** Read KEY=VALUE lines. Existing process env wins. No shell expansion. */
export const loadEnvFile = async (path) => {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (cause) {
    if (cause?.code === "ENOENT") return;
    throw cause;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const raw = trimmed.startsWith("export ") ? trimmed.slice(7) : trimmed;
    const index = raw.indexOf("=");
    if (index < 1) continue;
    const key = raw.slice(0, index).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let value = raw.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    process.env[key] = value;
  }
};

export const randomPassword = () => randomBytes(12).toString("base64url");
