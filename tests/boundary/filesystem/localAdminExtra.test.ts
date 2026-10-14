import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";

import {
  acceptedEngines,
  buildChecklist,
  diffSets,
  gateFast,
  isDue,
  takeHighest,
  writeHashes,
} from "../../../scripts/local-admin-extra.mjs";
import {
  textToPdf,
  webhookRequest,
} from "../../../scripts/local-admin-report-export.mjs";
import { openAdmin } from "../../../scripts/local-admin-store.mjs";
import { startLocalDashboard } from "../../../scripts/local-analyze-http.mjs";
import type { DashboardJob } from "../../../scripts/local-analyze-http.mjs";
import {
  analyze,
  bindLocalAnalyzer,
} from "../../../scripts/local-analyze-run.mjs";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

const HELLO_SHA =
  "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

it("hashes a file, marks a failed step red, and diffs a line", async () => {
  const directory = await createTestTempDirectory("local-admin-hash-");
  await writeFile(join(directory, "note.txt"), "hello");
  const written = await writeHashes(directory, "session-secret-value");
  const manifest = await readFile(join(directory, "hashes.sha256"), "utf8");
  expect(manifest).toContain(`${HELLO_SHA}  note.txt`);
  expect(written.digest).toMatch(/^[a-f0-9]{64}$/u);
  expect(written.signature).toMatch(/^[a-f0-9]{64}$/u);
  expect(await readFile(join(directory, "signature.txt"), "utf8")).toContain(
    "not a public code-signing certificate",
  );

  const checklist = buildChecklist(
    { steps: [{ id: "ghidra", ok: false, facts: [] }] },
    'password=hunter2 http://example.test android.permission.INTERNET {"paths":{"/notes":{}}}',
  );
  const blob = JSON.stringify(checklist);
  expect(checklist.items.some((item) => item.status === "red")).toBe(true);
  expect(blob).toContain("not an OWASP certificate");
  expect(blob).toContain("android.permission.INTERNET");
  expect(blob).not.toContain("hunter2");
  expect(blob).not.toContain("CVE");
  expect(diffSets("alpha\n", "alpha\nbeta\n").added).toEqual(["beta"]);
});

it("orders priority, limits fast mode, and shapes webhooks", () => {
  const waiting = [
    { job: { priority: 0, id: "normal" } },
    { job: { priority: 1, id: "high" } },
    { job: { priority: -1, id: "low" } },
  ];
  expect(takeHighest(waiting).job.id).toBe("high");
  expect(takeHighest(waiting).job.id).toBe("normal");
  expect(gateFast(true, "android").usePlan).toBe(false);
  expect(gateFast(true, "javascript").usePlan).toBe(true);
  expect(gateFast(false, "android").usePlan).toBe(true);
  const now = Date.now();
  expect(isDue({ everyMinutes: 15 }, now, false)).toBe(true);
  expect(isDue({ everyMinutes: 10 }, now, false)).toBe(false);
  expect(isDue({ everyMinutes: 15 }, now, true)).toBe(false);
  expect(
    webhookRequest("ftp://example.test/hook", { id: "1" }),
  ).toBeUndefined();
  expect(
    webhookRequest("https://discord.com/api/webhooks/1/abc", {
      id: "1",
      state: "done",
      target: "/tmp/app",
    })?.body,
  ).toHaveProperty("content");
  const telegram = webhookRequest(
    "https://api.telegram.org/bot123:ABC/sendMessage",
    { id: "1", state: "done", target: "/tmp/app" },
    "42",
  );
  expect(telegram?.body).toMatchObject({
    text: expect.any(String),
    chat_id: "42",
  });
  expect(
    webhookRequest("https://example.test/hook", { id: "1", state: "done" })
      ?.body,
  ).toHaveProperty("event", "job.finished");
  expect(
    acceptedEngines({ PATH: "/tmp/evil", GHIDRA_INSTALL_DIR: "/ghidra" }),
  ).toEqual(expect.not.objectContaining({ PATH: "/tmp/evil" }));
  expect(
    acceptedEngines({ PATH: "/tmp/evil", GHIDRA_INSTALL_DIR: "/ghidra" })
      .GHIDRA_INSTALL_DIR,
  ).toBe("/ghidra");
  expect(textToPdf("REA", "linha").subarray(0, 5).toString()).toBe("%PDF-");
});

it("does not plan Ghidra or JADX for a fast Android job", async () => {
  const directory = await createTestTempDirectory("local-admin-fast-");
  const calls: string[][] = [];
  bindLocalAnalyzer({
    runRea: async (args) => {
      calls.push([...args]);
      return { ok: true, stdout: "{}", stderr: "" };
    },
    commandExists: async () => false,
    detectTarget: async () => "android",
    planSteps: async () => {
      throw new Error("planned");
    },
    exists: async () => true,
    parseJson: () => ({}),
    factsFrom: () => [],
    integritySecret: () => "session-secret-value",
  });
  const job: {
    id: string;
    target: string;
    kind: string;
    fast: boolean;
    state: string;
    directory: string;
    events: { message: string }[];
    steps: { id?: string }[];
    digest?: string;
  } = {
    id: "fast-job",
    target: directory,
    kind: "android",
    fast: true,
    state: "queued",
    directory: join(directory, "out"),
    events: [],
    steps: [],
  };
  await analyze(job, () => {});
  expect(calls.some((args) => args.includes("ghidra"))).toBe(false);
  expect(calls.some((args) => args.includes("inspect-android-package"))).toBe(
    false,
  );
  expect(job.steps[0]?.id).toBe("fast-unsupported");
  expect(job.digest).toMatch(/^[a-f0-9]{64}$/u);
});

const cookieFrom = (response: Response) => {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
  return cookies[0]?.split(";")[0] ?? "";
};

it("serves a loopback report link and drops unknown engine keys", async () => {
  const directory = await createTestTempDirectory("local-admin-share-");
  const output = await createTestTempDirectory("local-admin-share-out-");
  const admin = await openAdmin({
    directory,
    env: { REA_ADMIN_USER: "admin", REA_ADMIN_PASSWORD: "correct-password" },
  });
  const jobs = new Map<string, DashboardJob>();
  const started = await startLocalDashboard({
    options: { port: 0, output, baseOutput: output },
    jobs,
    dashboardPath: join(process.cwd(), "scripts/local-analyze-dashboard.html"),
    analyze: async (job) => {
      job.state = "done";
    },
    admin,
  });
  onTestFinished(() => started.close());
  expect((await fetch(`${started.url}api/search?q=notes`)).status).toBe(401);
  expect((await fetch(`${started.url}r/not-a-real-token-value`)).status).toBe(
    404,
  );
  const signed = await fetch(`${started.url}api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "correct-password" }),
  });
  const cookie = cookieFrom(signed);
  const created = await fetch(`${started.url}api/analyze`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      target: directory,
      kind: "javascript",
      priority: 1,
      fast: true,
    }),
  });
  const job = (await created.json()) as {
    id: string;
    priority: number;
    fast: boolean;
  };
  expect(created.status).toBe(202);
  expect(job.priority).toBe(1);
  expect(job.fast).toBe(true);
  const share = await fetch(`${started.url}api/jobs/${job.id}/share`, {
    method: "POST",
    headers: { cookie },
  });
  const body = (await share.json()) as { path: string };
  expect(share.status).toBe(201);
  const page = await fetch(`${started.url}${body.path.slice(1)}`);
  expect(page.status).toBe(200);
  expect(await page.text()).toContain("127.0.0.1");
  const imported = await fetch(`${started.url}api/settings/engines`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      PATH: "/tmp/evil",
      LD_PRELOAD: "x",
      engines: { GHIDRA_INSTALL_DIR: "/opt/ghidra", PATH: "/still-evil" },
    }),
  });
  const engines = (await imported.json()) as {
    engines: Record<string, string>;
  };
  expect(imported.status).toBe(200);
  expect(engines.engines.GHIDRA_INSTALL_DIR).toBe("/opt/ghidra");
  expect(engines.engines.PATH).toBeUndefined();
  const pdf = await fetch(
    `${started.url}api/jobs/${job.id}/report.pdf?template=ctf`,
    { headers: { cookie } },
  );
  expect(pdf.status).toBe(200);
  expect((await pdf.text()).startsWith("%PDF-")).toBe(true);
});
