import { resolve, sep } from "node:path";

/** Shared text helpers for the local beginner package. No model calls. */

export const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export const parseJson = (text) => {
  const trimmed = String(text ?? "").trim();
  if (trimmed.length === 0) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
};

export const clip = (value, max = 1200) => {
  const text = String(value);
  return text.length > max ? `${text.slice(0, max)}\n…` : text;
};

export const slugFrom = (target, resolved) => {
  const base = (resolved ?? target ?? "").split(/[/\\]/u).pop() ?? "";
  const cleaned = base
    .replace(/\.git$/iu, "")
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  const slug = cleaned.slice(0, 80);
  return slug.length > 0 ? slug : "alvo";
};

/** Refuse paths that leave `root`. `relative` may contain URL encoding. */
export const safeChildPath = (root, relative) => {
  if (typeof relative !== "string" || relative.length === 0) return undefined;
  if (relative.includes("\0") || relative.includes("\\")) return undefined;
  let decoded;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    return undefined;
  }
  if (
    decoded.includes("..") ||
    decoded.startsWith("/") ||
    decoded.includes("\0")
  )
    return undefined;
  const full = resolve(root, decoded);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (full !== root && !full.startsWith(prefix)) return undefined;
  return full;
};

const SAFE_HREF = /^[A-Za-z0-9._/-]+$/u;

const inline = (text) => {
  const pattern = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]*)\]\(([^)]+)\)/gu;
  let cursor = 0;
  let html = "";
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    html += escapeHtml(text.slice(cursor, index));
    const image = match[1] !== undefined && match[0].startsWith("!");
    const label = image ? match[1] : match[3];
    const href = image ? match[2] : match[4];
    if (SAFE_HREF.test(href) && !href.includes("..")) {
      html += image
        ? `<img alt="${escapeHtml(label)}" src="${escapeHtml(href)}" />`
        : `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
    } else html += escapeHtml(match[0]);
    cursor = index + match[0].length;
  }
  return html + escapeHtml(text.slice(cursor));
};

const blockStart = (line) =>
  line.startsWith("#") || line.startsWith("- ") || line.startsWith("```");

const consumeFence = (lines, start) => {
  const body = [];
  let index = start + 1;
  while (index < lines.length && !lines[index].startsWith("```")) {
    body.push(lines[index]);
    index += 1;
  }
  return {
    html: `<pre>${escapeHtml(body.join("\n"))}</pre>`,
    next: index + 1,
  };
};

const consumeList = (lines, start) => {
  const items = [];
  let index = start;
  while (index < lines.length && lines[index].startsWith("- ")) {
    items.push(`<li>${inline(lines[index].slice(2))}</li>`);
    index += 1;
  }
  return { html: `<ul>${items.join("")}</ul>`, next: index };
};

/** Small Markdown subset used by the generated HTML reports. */
export const renderSimpleMarkdown = (markdown) => {
  const lines = String(markdown).split("\n");
  const parts = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith("```")) {
      const fence = consumeFence(lines, index);
      parts.push(fence.html);
      index = fence.next;
      continue;
    }
    if (line.startsWith("### ")) {
      parts.push(`<h3>${inline(line.slice(4))}</h3>`);
      index += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      parts.push(`<h2>${inline(line.slice(3))}</h2>`);
      index += 1;
      continue;
    }
    if (line.startsWith("# ")) {
      parts.push(`<h1>${inline(line.slice(2))}</h1>`);
      index += 1;
      continue;
    }
    if (line.startsWith("- ")) {
      const list = consumeList(lines, index);
      parts.push(list.html);
      index = list.next;
      continue;
    }
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !blockStart(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    parts.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  return parts.join("\n");
};

export const htmlDocument = (lang, title, body) => `<!doctype html>
<html lang="${lang === "en" ? "en" : "pt-BR"}">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; background: #f7f3ec; color: #1c1915; font-family: Georgia, "Iowan Old Style", serif; }
  main { max-width: 800px; margin: 0 auto; padding: 32px 20px 64px; }
  a { color: #2f5d50; }
  img { max-width: 100%; height: auto; background: #fffdf9; }
  pre, code { font-family: ui-monospace, Menlo, Consolas, monospace; }
  pre { white-space: pre-wrap; background: #fffdf9; border: 1px solid #e4ddd2; padding: 12px; border-radius: 8px; }
</style>
<main>
${body}
</main>
</html>
`;
