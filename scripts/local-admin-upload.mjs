import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { enqueueAnalysis } from "./local-admin-actions.mjs";
import { fail, json } from "./local-admin-reply.mjs";
import { publicJob } from "./local-analyze-jobs.mjs";

/** Accept a small set of binary uploads. Magic must match the extension. */

const ZIP = new Set(["apk", "xapk", "aab", "jar"]);
const ELF = new Set(["so", "elf", "bin"]);
const PE = new Set(["exe", "dll"]);
const MACHO = new Set(["feedface", "feedfacf", "cffaedfe", "cefaedfe"]);

export const uploadCap = () => {
  const raw = Number(process.env.REA_UPLOAD_MAX_BYTES ?? 40 * 1024 * 1024);
  const cap =
    Number.isInteger(raw) && raw > 0
      ? Math.min(raw, 40 * 1024 * 1024)
      : 40 * 1024 * 1024;
  return process.env.REA_DEMO === "1" ? Math.min(cap, 8 * 1024 * 1024) : cap;
};

export const safeName = (raw) => {
  const base = String(raw ?? "upload.bin")
    .split(/[/\\]/u)
    .pop();
  const cleaned = String(base)
    .replace(/[^A-Za-z0-9._-]/gu, "")
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : "upload.bin";
};

const extensionOf = (name) => {
  const base = safeName(name).toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1);
};

const magicKind = (bytes) => {
  if (!bytes || bytes.length < 4) return "";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "zip";
  if (bytes.subarray(0, 4).toString("utf8") === "dex\n") return "dex";
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) return "pe";
  if (bytes[0] === 0x7f && bytes.subarray(1, 4).toString("utf8") === "ELF")
    return "elf";
  return MACHO.has(bytes.subarray(0, 4).toString("hex")) ? "macho" : "";
};

export const acceptedUpload = (name, bytes) => {
  const extension = extensionOf(name);
  const kind = magicKind(bytes);
  if (extension.length === 0 || kind.length === 0) return false;
  if (ZIP.has(extension)) return kind === "zip";
  if (extension === "dex") return kind === "dex";
  if (PE.has(extension)) return kind === "pe";
  if (ELF.has(extension)) return kind === "elf";
  return (extension === "macho" || extension === "dylib") && kind === "macho";
};

const readBody = (request, max) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > max) {
        const error = new Error("too-large");
        error.code = "LIMIT";
        request.destroy();
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });

export const fileFromMultipart = (buffer, type) => {
  const found = /boundary=(?:"([^"]+)"|([^;\s]+))/iu.exec(String(type ?? ""));
  if (!found) return undefined;
  const boundary = found[1] ?? found[2];
  let cursor = 0;
  while (cursor < buffer.length) {
    const at = buffer.indexOf(Buffer.from(`--${boundary}`), cursor);
    if (at < 0) return undefined;
    const split = buffer.indexOf(Buffer.from("\r\n\r\n"), at);
    const next = buffer.indexOf(Buffer.from(`\r\n--${boundary}`), split + 4);
    if (split < 0 || next < 0) return undefined;
    const header = buffer.subarray(at, split).toString("latin1");
    if (/name="file"/iu.test(header)) {
      const name = /filename="([^"]*)"/iu.exec(header)?.[1] ?? "upload.bin";
      return { name, bytes: buffer.subarray(split + 4, next) };
    }
    cursor = next + 2;
  }
  return undefined;
};

export const readUpload = async (request, max) => {
  const type = String(request.headers["content-type"] ?? "");
  const body = await readBody(request, max);
  if (type.includes("multipart/form-data"))
    return fileFromMultipart(body, type);
  if (body.length === 0) return undefined;
  return {
    name: String(request.headers["x-rea-filename"] ?? "upload.bin"),
    bytes: body,
  };
};

const rejectUpload = (response, code) => {
  if (code === "LIMIT") {
    fail(response, 413, "Arquivo grande demais.", "File is too large.");
    return;
  }
  fail(response, 400, "Tipo de arquivo não aceito.", "File type not accepted.");
};

export const postUpload = async (ctx) => {
  let parsed;
  try {
    parsed = await readUpload(ctx.request, uploadCap());
  } catch (cause) {
    rejectUpload(ctx.response, cause?.code);
    return;
  }
  if (!parsed || !acceptedUpload(parsed.name, parsed.bytes)) {
    rejectUpload(ctx.response, "TYPE");
    return;
  }
  const folder = join(ctx.options.output, "uploads", ctx.actor.user);
  await mkdir(folder, { recursive: true });
  const stored = join(
    folder,
    `${randomBytes(4).toString("hex")}-${safeName(parsed.name)}`,
  );
  await writeFile(stored, parsed.bytes, { mode: 0o600 });
  const job = await enqueueAnalysis(ctx, stored, { kind: "auto" });
  await ctx.admin.audit({
    user: ctx.actor.user,
    action: "upload",
    detail: safeName(parsed.name),
  });
  json(ctx.response, 202, publicJob(job));
};
