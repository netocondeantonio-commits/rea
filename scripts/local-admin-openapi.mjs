import { json, send } from "./local-admin-reply.mjs";

/** Compact admin API description. It does not load a remote Swagger page. */

const path = (summary) => ({ get: { summary } });
const post = (summary) => ({ post: { summary } });

export const pipelineMap = () => ({
  billing: false,
  fast: {
    note_pt: "JavaScript e site estático não chamam Ghidra nem JADX.",
    note_en: "JavaScript and static sites do not call Ghidra or JADX.",
  },
  engines: [
    {
      id: "ghidra",
      runs: true,
      note_pt: "Nativo, se GHIDRA_INSTALL_DIR existir.",
      note_en: "Native, when GHIDRA_INSTALL_DIR is set.",
    },
    {
      id: "jadx",
      runs: true,
      note_pt: "APK, se REA_JADX_MCP_JAR existir.",
      note_en: "APK, when REA_JADX_MCP_JAR is set.",
    },
    {
      id: "rizin",
      runs: true,
      note_pt: "Informação nativa.",
      note_en: "Native info.",
    },
    {
      id: "objdump",
      runs: true,
      note_pt: "Cabeçalhos do arquivo.",
      note_en: "File headers.",
    },
    {
      id: "frida",
      runs: true,
      note_pt: "Lista dispositivos. Não anexa e não injeta.",
      note_en: "Lists devices. It does not attach and does not inject.",
    },
    {
      id: "apktool",
      runs: true,
      note_pt: "Decodifica o manifesto e as strings. Não gera smali.",
      note_en: "Decodes the manifest and strings. It does not emit smali.",
    },
    {
      id: "gdb",
      runs: false,
      note_pt: "Detectado, não lançado por esta página.",
      note_en: "Detected, not launched by this page.",
    },
  ],
  companions: [
    "Ghidra",
    "GhidraMCP",
    "JADX",
    "jadx-headless-mcp",
    "Rizin",
    "Frida",
    "objdump",
    "gdb",
    "Apktool",
    "ida-pro-mcp",
  ],
});

export const openApiSpec = () => ({
  openapi: "3.0.3",
  info: {
    title: "REA admin",
    version: "1",
    description:
      "Admin API for local analysis. No plans, billing, Stripe, or checkout. Portuguese and English notes are at /api/docs.",
  },
  paths: {
    "/api/health": path("Process health. No engine paths."),
    "/api/login": post("Password login. Sets a cookie and returns a JWT."),
    "/api/logout": post("Clear the session cookie."),
    "/api/me": path("Current user, language, theme, demo flag."),
    "/api/home": path("Engine status, queue, and recent jobs for this user."),
    "/api/jobs": path("Jobs visible to this user."),
    "/api/analyze": post("Enqueue a path, GitHub URL, or pinned APK."),
    "/api/upload": post("Upload an APK or binary, then enqueue it."),
    "/api/diff": post("Compare two visible finished jobs."),
    "/api/search": path("Search visible evidence text."),
    "/api/map": path(
      "Engine pipeline map. Frida and Apktool are not executed.",
    ),
    "/api/openapi.json": path("This document."),
    "/api/docs": path("Short Portuguese and English notes."),
    "/api/targets": {
      get: { summary: "Visible saved targets." },
      post: { summary: "Save a target." },
    },
    "/api/settings": {
      get: { summary: "Admin settings." },
      put: { summary: "Update settings." },
    },
    "/api/settings/engines": {
      get: { summary: "Export engine keys." },
      post: { summary: "Import engine keys. PATH is dropped." },
    },
    "/api/users": {
      get: { summary: "Admin user list." },
      post: { summary: "Create a user. Role user is stored as operator." },
    },
    "/api/audit": path("Admin audit log. Webhook URLs are not stored."),
  },
});

const docsPage = () => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>REA admin API</title>
<style>body{font-family:sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.45}code{font-family:ui-monospace,monospace}</style>
</head><body>
<h1>REA admin API</h1>
<p>Sem planos, cobrança, Stripe ou checkout. O spec está em <a href="/api/openapi.json"><code>/api/openapi.json</code></a>. O mapa está em <a href="/api/map"><code>/api/map</code></a> depois do login.</p>
<p>No plans, billing, Stripe, or checkout. The spec is at <a href="/api/openapi.json"><code>/api/openapi.json</code></a>. The map is at <a href="/api/map"><code>/api/map</code></a> after login.</p>
<h2>Login / papéis</h2>
<p>POST <code>/api/login</code> devolve um cookie <code>rea_session</code> e um JWT HS256 no campo <code>token</code>. O papel <code>user</code> é gravado como operador. Um administrador vê todas as análises. Outro usuário vê só as próprias. Um pedido a análise alheia responde 404.</p>
<p>POST <code>/api/login</code> returns an <code>rea_session</code> cookie and an HS256 JWT in <code>token</code>. Role <code>user</code> is stored as operator. An admin sees every analysis. Another user sees only their own. Another user's analysis returns 404.</p>
<h2>Motores</h2>
<p>O pipeline chama Ghidra, JADX, Rizin, objdump e Apktool quando estão configurados. O Apktool decodifica manifesto e strings, sem smali. O Frida só lista dispositivos: não anexa e não injeta. O modo rápido pula esses motores em JavaScript e site estático.</p>
<p>The pipeline calls Ghidra, JADX, Rizin, objdump, and Apktool when they are configured. Apktool decodes the manifest and strings, without smali. Frida only lists devices: it does not attach and does not inject. Fast mode skips those engines for JavaScript and static sites.</p>
<h2>Sandbox e proxy</h2>
<p>O sandbox começa desligado no computador local. <code>REA_SANDBOX=1</code> liga o modo isolate (sem rede, com taskset e prlimit). <code>REA_SANDBOX_MODE=docker</code> usa <code>--memory</code> e <code>--cpus</code>. Se a ferramenta escolhida faltar, o alvo não roda no host. A porta padrão é 4174. As portas 80 e 443 ficam com o proxy.</p>
<p>The sandbox starts off on a local computer. <code>REA_SANDBOX=1</code> turns on isolate mode (no network, with taskset and prlimit). <code>REA_SANDBOX_MODE=docker</code> uses <code>--memory</code> and <code>--cpus</code>. If the chosen tool is missing, the target does not run on the host. The default port is 4174. Ports 80 and 443 stay with the proxy.</p>
<p>Licenças de IDA, Hopper, JEB e das peças GPL/LGPL continuam valendo. Isto não é parecer jurídico.</p>
<p>IDA, Hopper, JEB, and GPL/LGPL terms still apply. This is not legal advice.</p>
</body></html>`;

export const answerPublic = (ctx, url) => {
  if (ctx.request.method === "OPTIONS") {
    send(ctx.response, 204, "", "text/plain");
    return true;
  }
  if (ctx.request.method !== "GET") return false;
  if (url.pathname === "/api/health") {
    json(ctx.response, 200, {
      ok: true,
      service: "rea-admin",
      demo: process.env.REA_DEMO === "1",
    });
    return true;
  }
  if (url.pathname === "/api/openapi.json") {
    json(ctx.response, 200, openApiSpec());
    return true;
  }
  if (url.pathname === "/api/docs") {
    send(ctx.response, 200, docsPage(), "text/html; charset=utf-8");
    return true;
  }
  return false;
};
