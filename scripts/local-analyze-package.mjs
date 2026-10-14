import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { packageArtifacts, phrase } from "./local-analyze-copy.mjs";
import {
  architectureDoc,
  findingsDoc,
  overviewDoc,
  readmeDoc,
} from "./local-analyze-docs.mjs";
import {
  doctorDoc,
  evidenceDoc,
  glossaryDoc,
  openApiDoc,
  stringsDoc,
  toolsDoc,
} from "./local-analyze-docs-rest.mjs";
import {
  countsFromDocument,
  excerptFromDocument,
  fieldsFromDocument,
  functionsFromDocument,
  graphsFromDocument,
  httpFromDocument,
  limitationsFromDocument,
  mermaidFromGraphs,
  subjectFromDocument,
  svgFromGraphs,
} from "./local-analyze-graphs.mjs";
import {
  openApiDocument,
  readBinaryStrings,
  readPackageManifest,
  scanSource,
} from "./local-analyze-scan.mjs";
import {
  clip,
  escapeHtml,
  htmlDocument,
  parseJson,
  renderSimpleMarkdown,
  slugFrom,
} from "./local-analyze-text.mjs";

const DOCS = [
  ["README", readmeDoc],
  ["overview", overviewDoc],
  ["architecture", architectureDoc],
  ["findings", findingsDoc],
  ["tools", toolsDoc],
  ["openapi", openApiDoc],
  ["doctor", doctorDoc],
  ["strings", stringsDoc],
  ["evidence", evidenceDoc],
  ["glossary", (_facts, lang) => glossaryDoc(lang)],
];

const loadEvidence = async (directory) => {
  const folder = join(directory, "evidence");
  let names = [];
  try {
    names = await readdir(folder);
  } catch {
    return [];
  }
  const documents = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const path = join(folder, name);
    const info = await stat(path);
    documents.push({
      name,
      bytes: info.size,
      parsed: parseJson(await readFile(path, "utf8")),
    });
  }
  return documents;
};

const mergeEvidence = (documents) => {
  const merged = {
    graphs: [],
    functions: [],
    limitations: [],
    counts: [],
    fields: [],
    http: [],
    excerpts: [],
    subject: null,
    rizinExcerpt: "",
  };
  for (const document of documents) {
    if (!document.parsed) continue;
    merged.graphs.push(...graphsFromDocument(document.parsed, document.name));
    merged.functions.push(...functionsFromDocument(document.parsed));
    for (const line of limitationsFromDocument(document.parsed)) {
      if (!merged.limitations.includes(line)) merged.limitations.push(line);
    }
    merged.counts.push(...countsFromDocument(document.parsed));
    merged.fields.push(...fieldsFromDocument(document.parsed));
    merged.http.push(...httpFromDocument(document.parsed, document.name));
    const excerpt = excerptFromDocument(document.parsed);
    if (excerpt)
      merged.excerpts.push({ sourceName: document.name, text: excerpt });
    merged.subject ??= subjectFromDocument(document.parsed);
    if (document.name.startsWith("rizin-strings"))
      merged.rizinExcerpt = excerpt;
  }
  merged.functions = merged.functions.slice(0, 40);
  merged.counts = merged.counts.slice(0, 40);
  merged.fields = merged.fields.slice(0, 20);
  merged.excerpts = merged.excerpts.slice(0, 4);
  return merged;
};

const doctorFrom = (parsed, result) => {
  const report = Array.isArray(parsed?.checks)
    ? parsed
    : parsed?.normalized_result;
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  return {
    healthy: report?.healthy === true,
    environmentHealthy: report?.environment_healthy === true,
    error: result.ok ? "" : clip(result.stderr || "doctor failed", 500),
    checks: checks.slice(0, 80).map((check) => ({
      name: String(check?.name ?? ""),
      ok: check?.ok === true,
      detail:
        typeof check?.detail === "string" ? check.detail.slice(0, 240) : "",
      remediation:
        typeof check?.remediation === "string"
          ? check.remediation.slice(0, 300)
          : "",
    })),
    raw: parsed ?? { ok: false, stderr: clip(result.stderr, 500) },
  };
};

const loadDoctor = async (runRea) => {
  try {
    const result = await runRea(["doctor"], 120_000);
    return doctorFrom(parseJson(result.stdout), result);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return {
      healthy: false,
      environmentHealthy: false,
      error: clip(message, 500),
      checks: [],
      raw: { ok: false },
    };
  }
};

const exists = async (commandExists, command) => {
  try {
    return await commandExists(command);
  } catch {
    return false;
  }
};

const loadCompanions = async (commandExists) => ({
  ghidra: (process.env.GHIDRA_INSTALL_DIR ?? "").length > 0,
  jadx: (process.env.REA_JADX_MCP_JAR ?? "").length > 0,
  rizin: await exists(commandExists, process.env.REA_RIZIN_COMMAND ?? "rizin"),
  objdump: await exists(
    commandExists,
    process.env.REA_OBJDUMP_COMMAND ?? "objdump",
  ),
  frida: await exists(commandExists, "frida"),
  apktool: await exists(
    commandExists,
    process.env.REA_APKTOOL_COMMAND ?? "apktool",
  ),
  ghidraMcp: await exists(
    commandExists,
    process.env.GHIDRA_MCP_BIN ?? "ghidra-mcp",
  ),
  gdb: await exists(commandExists, process.env.REA_GDB_COMMAND ?? "gdb"),
});

const dedupeRoutes = (routes) => {
  const seen = new Set();
  const unique = [];
  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(route);
    if (unique.length >= 40) break;
  }
  return unique;
};

const electronNamed = (manifest, graphs) => {
  const declared = [
    ...(manifest?.dependencies ?? []),
    ...(manifest?.devDependencies ?? []),
  ];
  if (
    declared.some((item) => item === "electron" || item.startsWith("electron@"))
  )
    return true;
  return graphs.some((graph) =>
    graph.nodes.some((node) => node.kind === "electron-main"),
  );
};

const collectFacts = async (job, tools) => {
  const commandExists = tools.commandExists ?? (async () => false);
  const [documents, manifest, scan, doctor, companions, binaryStrings] =
    await Promise.all([
      loadEvidence(job.directory),
      readPackageManifest(job.resolved),
      scanSource(job.resolved),
      loadDoctor(tools.runRea),
      tools.companions ?? loadCompanions(commandExists),
      readBinaryStrings(job.resolved, commandExists),
    ]);
  const merged = mergeEvidence(documents);
  const slug = slugFrom(job.target, job.resolved);
  const http = dedupeRoutes([...scan.http, ...merged.http]);
  const strings = [
    ...scan.strings,
    ...binaryStrings.map((value) => ({ value, file: "strings", line: null })),
  ].slice(0, 60);
  const drawing = mermaidFromGraphs(merged.graphs);
  return {
    ...merged,
    documents,
    manifest,
    scan: { filesRead: scan.filesRead, capped: scan.capped },
    urls: scan.urls,
    http,
    strings,
    doctor,
    companions,
    slug,
    name: manifest?.name || merged.subject?.name || slug,
    target: job.target,
    resolved: job.resolved ?? "",
    detected: job.detected ?? "unknown",
    steps: job.steps ?? [],
    electron: electronNamed(manifest, merged.graphs),
    openApi: openApiDocument(http, manifest?.name || slug),
    mermaid: drawing.text,
    mermaidOmitted: drawing.omitted,
    svg: svgFromGraphs(merged.graphs),
    evidenceFiles: documents.map((document) => ({
      name: document.name,
      bytes: document.bytes,
    })),
  };
};

const writePair = async (dir, base, build, facts) => {
  for (const lang of ["pt-BR", "en"]) {
    const markdown = build(facts, lang);
    const text = markdown.endsWith("\n") ? markdown : `${markdown}\n`;
    await writeFile(join(dir, `${base}.${lang}.md`), text);
    const title = text.split("\n")[0].replace(/^#\s/u, "");
    await writeFile(
      join(dir, `${base}.${lang}.html`),
      htmlDocument(lang, title, renderSimpleMarkdown(text)),
    );
  }
};

const indexHtml = (facts) => {
  const column = (lang) => {
    const cards = packageArtifacts("local")
      .filter((item) => item.lang === "both" || item.lang === lang)
      .map((item) => {
        const title = lang === "en" ? item.title_en : item.title_pt;
        const blurb = lang === "en" ? item.blurb_en : item.blurb_pt;
        return `<article><h2><a href="${escapeHtml(item.file)}">${escapeHtml(title)}</a></h2><p>${escapeHtml(blurb)}</p></article>`;
      });
    return `<section lang="${lang}"><h1>${escapeHtml(phrase(lang, "Pacote local", "Local package"))}</h1><p>${escapeHtml(facts.name)}</p>${cards.join("")}</section>`;
  };
  return `<!doctype html>
<html lang="pt-BR">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(facts.name)}</title>
<style>
  body { margin: 0; background: #f7f3ec; color: #1c1915; font-family: Georgia, serif; }
  main { max-width: 980px; margin: 0 auto; padding: 28px 16px 64px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  section, article { background: #fffdf9; border: 1px solid #e4ddd2; border-radius: 12px; padding: 12px 16px; }
  a { color: #2f5d50; }
  @media (max-width: 800px) { main { grid-template-columns: 1fr; } }
</style>
<main>
${column("pt-BR")}
${column("en")}
</main>
</html>
`;
};

const writeDocuments = async (dir, facts) => {
  for (const [base, build] of DOCS) await writePair(dir, base, build, facts);
  await writeFile(join(dir, "architecture.mmd"), facts.mermaid);
  await writeFile(join(dir, "architecture.svg"), facts.svg);
  await writeFile(
    join(dir, "openapi.json"),
    `${JSON.stringify(facts.openApi, null, 2)}\n`,
  );
  await writeFile(
    join(dir, "doctor.json"),
    `${JSON.stringify(facts.doctor.raw, null, 2)}\n`,
  );
  const lines = facts.strings.map((item) =>
    typeof item === "string" ? item : item.value,
  );
  await writeFile(join(dir, "strings.txt"), `${lines.join("\n")}\n`);
  await writeFile(join(dir, "index.html"), indexHtml(facts));
};

const copyEvidence = async (documents, directory, dest) => {
  await mkdir(dest, { recursive: true });
  for (const document of documents)
    await copyFile(
      join(directory, "evidence", document.name),
      join(dest, document.name),
    );
};

/** Write output/<target>/ from the job directory. Does not call a model. */
export const writeLocalPackage = async (job, tools) => {
  const facts = await collectFacts(job, tools);
  const dir = join(job.directory, "output", facts.slug);
  await mkdir(dir, { recursive: true });
  await copyEvidence(facts.documents, job.directory, join(dir, "evidence"));
  await writeDocuments(dir, facts);
  job.package_slug = facts.slug;
  job.artifacts = packageArtifacts(job.id);
};
