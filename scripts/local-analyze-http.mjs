import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { handleRequest } from "./local-admin-routes.mjs";
import { openAdmin } from "./local-admin-store.mjs";
import { json } from "./local-admin-reply.mjs";
import { loadHistory, setEngineEnv } from "./local-analyze-jobs.mjs";

const listen = (server, port) =>
  new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolveListen(
        typeof address === "object" && address ? address.port : port,
      );
    });
  });

/** Loopback admin page. Never binds a public interface. */
export const startLocalDashboard = async (deps) => {
  const admin =
    deps.admin ??
    (await openAdmin({
      directory:
        deps.options.adminDirectory ??
        join(homedir(), ".local", "share", "rea", "admin"),
    }));
  if (!deps.admin && admin.generatedPassword)
    process.stderr.write(
      `Senha inicial do administrador local: ${admin.generatedPassword}\n`,
    );
  setEngineEnv(() => admin.engineEnv());
  if (!deps.options.baseOutput) deps.options.baseOutput = deps.options.output;
  await loadHistory(deps.options.output, deps.jobs);
  const dashboard = await readFile(deps.dashboardPath);
  const server = createServer((request, response) => {
    handleRequest({
      request,
      response,
      jobs: deps.jobs,
      options: deps.options,
      analyze: deps.analyze,
      admin,
      dashboard,
      runRea: deps.runRea,
      commandExists: deps.commandExists,
    }).catch((cause) => {
      json(response, 500, {
        message: cause instanceof Error ? cause.message : String(cause),
        message_en: "The local page failed.",
      });
    });
  });
  const port = await listen(server, deps.options.port);
  const url = `http://127.0.0.1:${port}/`;
  process.stderr.write(`Painel local: ${url}\n`);
  return {
    url,
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      }),
  };
};
