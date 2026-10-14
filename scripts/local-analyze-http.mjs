import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  bindAddress,
  ensureDemoUser,
  shownHost,
} from "./local-admin-access.mjs";
import { handleRequest } from "./local-admin-routes.mjs";
import { sandboxConfigFrom, setSandboxConfig } from "./local-admin-sandbox.mjs";
import { createShareStore } from "./local-admin-share.mjs";
import { startSchedule } from "./local-admin-schedule.mjs";
import { openAdmin } from "./local-admin-store.mjs";
import { json } from "./local-admin-reply.mjs";
import { loadHistory, setEngineEnv } from "./local-analyze-jobs.mjs";

const listen = (server, port, host) =>
  new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolveListen(
        typeof address === "object" && address ? address.port : port,
      );
    });
  });

/** Admin page. The default bind is 127.0.0.1. Ports 80 and 443 are refused. */
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
  setSandboxConfig(() => sandboxConfigFrom(admin.readSettings()));
  const demoPassword = await ensureDemoUser(admin);
  if (demoPassword.length > 0)
    process.stderr.write(`Senha do usuário demo: ${demoPassword}\n`);
  if (!deps.options.baseOutput) deps.options.baseOutput = deps.options.output;
  await loadHistory(deps.options.output, deps.jobs);
  const shares = await createShareStore(admin.directory);
  const stopSchedule = startSchedule({
    admin,
    jobs: deps.jobs,
    output: () => deps.options.output,
    analyze: deps.analyze,
  });
  const dashboard = await readFile(deps.dashboardPath);
  const server = createServer((request, response) => {
    handleRequest({
      request,
      response,
      jobs: deps.jobs,
      options: deps.options,
      analyze: deps.analyze,
      admin,
      shares,
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
  const bound = bindAddress(
    deps.options.host ?? "127.0.0.1",
    deps.options.port,
  );
  if (bound.error) throw new Error(bound.error);
  const port = await listen(server, bound.port, bound.host);
  const url = `http://${shownHost(bound.host)}:${port}/`;
  process.stderr.write(`Painel: ${url}\n`);
  return {
    url,
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        stopSchedule();
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      }),
  };
};
