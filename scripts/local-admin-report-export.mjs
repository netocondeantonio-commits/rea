import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateAddress, publicHttpUrl } from "./local-admin-access.mjs";

/** PDF, webhook body, and the read-only share page. No model is called. */

const CERT_EN =
  "This is not an OWASP certificate and does not mean the program is safe.";
const CERT_PT =
  "Isto não é um certificado OWASP e não significa que o programa é seguro.";
const TEMPLATES = new Set(["client", "internal", "ctf"]);
const WINANSI = new Map([
  ["á", 0xe1],
  ["à", 0xe0],
  ["â", 0xe2],
  ["ã", 0xe3],
  ["é", 0xe9],
  ["ê", 0xea],
  ["í", 0xed],
  ["ó", 0xf3],
  ["ô", 0xf4],
  ["õ", 0xf5],
  ["ú", 0xfa],
  ["ç", 0xe7],
  ["Á", 0xc1],
  ["Ã", 0xc3],
  ["É", 0xc9],
  ["Í", 0xcd],
  ["Ó", 0xd3],
  ["Õ", 0xd5],
  ["Ú", 0xda],
  ["Ç", 0xc7],
]);

const checklistLines = (name, items) =>
  (items ?? []).map((item) => {
    const observation =
      name === "client" ? item.observation : item.observation_en;
    return `${item.status}: ${observation}`;
  });

const internalLines = (job) => {
  const lines = [
    "",
    `digest: ${job?.digest ?? ""}`,
    "signature: local integrity tag, not a public code-signing certificate",
  ];
  for (const step of job?.steps ?? []) {
    const mark = step.ok === true ? "ok" : (step.skip ?? "not ok");
    lines.push(`step ${step.id}: ${mark}`);
  }
  return lines;
};

const templateExtra = (name, job) => {
  if (name === "internal") return internalLines(job);
  if (name === "ctf")
    return [
      "",
      "No challenge flag or solution is inferred from these files.",
      "Strings and routes below are copied text, not answers.",
    ];
  return [];
};

export const renderTemplate = (template, job) => {
  const name = TEMPLATES.has(template) ? template : "client";
  const lines = [
    `REA local report (${name})`,
    String(job?.target ?? ""),
    `state: ${job?.state ?? ""}`,
    `kind: ${job?.kind ?? ""}`,
    "",
    CERT_EN,
    CERT_PT,
    ...checklistLines(name, job?.checklist?.items),
    ...templateExtra(name, job),
  ];
  return lines.join("\n");
};

const pdfChar = (char) => {
  if (char === "\\") return "\\\\";
  if (char === "(") return "\\(";
  if (char === ")") return "\\)";
  const code = char.codePointAt(0);
  if (code >= 32 && code <= 126) return char;
  if (!WINANSI.has(char)) return "?";
  return `\\${WINANSI.get(char).toString(8).padStart(3, "0")}`;
};

const pdfToken = (text) => [...text].map(pdfChar).join("");

const pdfStream = (lines) => {
  const commands = ["BT", "/F1 10 Tf", "50 800 Td"];
  for (let index = 0; index < lines.length; index += 1) {
    if (index > 0) commands.push("0 -14 Td");
    commands.push(`(${lines[index]}) Tj`);
  }
  commands.push("ET");
  return commands.join("\n");
};

export const textToPdf = (title, body) => {
  const lines = [title, ...String(body).split("\n")]
    .slice(0, 48)
    .map((line) => pdfToken(line.slice(0, 90)));
  const stream = pdfStream(lines);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj ${objects[index]} endobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  for (let index = 1; index <= 5; index += 1)
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
};

const discordHost = (host) =>
  host === "discord.com" ||
  host === "discordapp.com" ||
  host.endsWith(".discord.com") ||
  host.endsWith(".discordapp.com");

const genericBody = (job) => ({
  event: "job.finished",
  job: {
    id: job?.id ?? "",
    state: job?.state ?? "",
    target: job?.target ?? "",
    digest: job?.digest ?? "",
  },
});

const webhookBody = (host, summary, job, chatId) => {
  if (discordHost(host)) return { content: summary };
  if (host !== "api.telegram.org") return genericBody(job);
  const body = { text: summary };
  if (typeof chatId === "string" && /^-?[0-9]{1,32}$/u.test(chatId))
    body.chat_id = chatId;
  return body;
};

const hostIsPublic = async (hostname) => {
  if (isIP(hostname) !== 0) return !isPrivateAddress(hostname);
  const records = await lookup(hostname, { all: true });
  return records.every((row) => !isPrivateAddress(row.address));
};

export const webhookRequest = (rawUrl, job, chatId) => {
  const url = publicHttpUrl(rawUrl);
  if (!url) return undefined;
  const summary =
    `REA ${job?.state ?? ""} ${job?.id ?? ""} ${job?.target ?? ""}`.slice(
      0,
      300,
    );
  return {
    url: url.toString(),
    body: webhookBody(url.hostname, summary, job, chatId),
  };
};

export const deliverWebhook = async (rawUrl, job, chatId) => {
  const request = webhookRequest(rawUrl, job, chatId);
  if (!request) return { status: 0 };
  try {
    if (!(await hostIsPublic(new URL(request.url).hostname)))
      return { status: 0 };
  } catch {
    return { status: 0 };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request.body),
      redirect: "error",
      signal: controller.signal,
    });
    return { status: response.status };
  } catch {
    return { status: 0 };
  } finally {
    clearTimeout(timer);
  }
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const shareLinks = (job, token) =>
  (job?.artifacts ?? [])
    .filter(
      (item) =>
        typeof item.href === "string" &&
        item.href.startsWith(`/packages/${job.id}/`),
    )
    .map((item) => {
      const relativePath = item.href.slice(`/packages/${job.id}/`.length);
      const href = `/r/${token}/pkg/${relativePath}`;
      const label = item.title_pt ?? relativePath;
      return `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`;
    })
    .join("");

export const shareDocument = (job, token) => {
  const items = (job?.checklist?.items ?? [])
    .map(
      (item) =>
        `<li>${escapeHtml(item.status)}: ${escapeHtml(item.observation)}</li>`,
    )
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>REA</title></head><body><p>Este endereço usa um token. No padrão ele só responde em 127.0.0.1. Quem publica o painel torna o token um link de capacidade.</p><p>${escapeHtml(job?.target ?? "")}</p><p>${escapeHtml(CERT_PT)}</p><ul>${items}</ul><ul>${shareLinks(job, token)}</ul><p><a href="/r/${token}/pkg/hashes.sha256">hashes.sha256</a></p></body></html>`;
};
