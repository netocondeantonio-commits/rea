import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { safeChildPath } from "./local-analyze-text.mjs";

const send = (response, status, body, type) => {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
  });
  response.end(body);
};

const json = (response, status, value) =>
  send(response, status, JSON.stringify(value), "application/json");

const readBody = (request) =>
  new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size < 8192) chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });

const targetFrom = (raw) => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { error: "JSON inválido." };
  }
  const target =
    typeof payload.target === "string" ? payload.target.trim() : "";
  if (target.length === 0 || target.includes("\0"))
    return { error: "Informe um caminho ou uma URL do GitHub." };
  return { target };
};

const contentType = (file) => {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".md") || file.endsWith(".txt") || file.endsWith(".mmd"))
    return "text/plain; charset=utf-8";
  return undefined;
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

const servePackageRoute = async (url, request, response, jobs) => {
  if (request.method !== "GET") return false;
  const nested = /^\/packages\/([A-Za-z0-9-]+)\/(.+)$/u.exec(url.pathname);
  if (nested !== null) {
    await sendPackage(response, jobs.get(nested[1]), nested[2]);
    return true;
  }
  const root = /^\/packages\/([A-Za-z0-9-]+)\/?$/u.exec(url.pathname);
  if (root === null) return false;
  await sendPackage(response, jobs.get(root[1]), "index.html");
  return true;
};

const busy = (jobs) =>
  [...jobs.values()].some(
    (job) => job.state === "running" || job.state === "queued",
  );

const handleRequest = async ({
  request,
  response,
  jobs,
  dashboard,
  options,
  analyze,
  createJob,
}) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/") {
    send(response, 200, dashboard, "text/html; charset=utf-8");
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/jobs") {
    json(response, 200, [...jobs.values()]);
    return;
  }
  const jobMatch = /^\/api\/jobs\/([A-Za-z0-9-]+)$/u.exec(url.pathname);
  if (request.method === "GET" && jobMatch !== null) {
    const job = jobs.get(jobMatch[1]);
    if (job === undefined) {
      json(response, 404, { message: "Análise não encontrada." });
      return;
    }
    json(response, 200, job);
    return;
  }
  if (await servePackageRoute(url, request, response, jobs)) return;
  const reportMatch = /^\/reports\/([A-Za-z0-9-]+)$/u.exec(url.pathname);
  if (request.method === "GET" && reportMatch !== null) {
    const job = jobs.get(reportMatch[1]);
    if (job === undefined) {
      send(response, 404, "não encontrado", "text/plain; charset=utf-8");
      return;
    }
    try {
      const html = await readFile(join(job.directory, "report.html"));
      send(response, 200, html, "text/html; charset=utf-8");
    } catch {
      send(
        response,
        404,
        "relatório ainda não existe",
        "text/plain; charset=utf-8",
      );
    }
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/analyze") {
    if (busy(jobs)) {
      json(response, 409, { message: "Já existe uma análise em andamento." });
      return;
    }
    const parsed = targetFrom(await readBody(request));
    if (parsed.error !== undefined) {
      json(response, 400, { message: parsed.error });
      return;
    }
    const job = createJob(options.output, parsed.target);
    jobs.set(job.id, job);
    json(response, 202, job);
    analyze(job, () => {}).catch((cause) => {
      job.state = "failed";
      job.events.push({
        message: cause instanceof Error ? cause.message : String(cause),
      });
    });
    return;
  }
  send(response, 404, "não encontrado", "text/plain; charset=utf-8");
};

/** Loopback page for one local analysis. Never binds a public interface. */
export const startLocalDashboard = async ({
  options,
  jobs,
  dashboardPath,
  analyze,
  createJob,
}) => {
  const dashboard = await readFile(dashboardPath);
  const server = createServer((request, response) => {
    handleRequest({
      request,
      response,
      jobs,
      dashboard,
      options,
      analyze,
      createJob,
    }).catch((cause) => {
      json(response, 500, {
        message: cause instanceof Error ? cause.message : String(cause),
      });
    });
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", resolveListen);
  });
  const address = `http://127.0.0.1:${options.port}/`;
  process.stderr.write(`Painel local: ${address}\n`);
  return address;
};
