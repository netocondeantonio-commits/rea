import { expect, it, onTestFinished } from "vitest";

import {
  allowRequest,
  bindAddress,
  demoAllowsTarget,
  guardJobs,
  publicHttpUrl,
  resetLimits,
} from "../../../scripts/local-admin-access.mjs";
import { readJwt, signJwt } from "../../../scripts/local-admin-auth.mjs";
import { webhookRequest } from "../../../scripts/local-admin-report-export.mjs";
import { sandboxArgs } from "../../../scripts/local-admin-sandbox.mjs";
import { openAdmin } from "../../../scripts/local-admin-store.mjs";
import { acceptedUpload } from "../../../scripts/local-admin-upload.mjs";
import { startLocalDashboard } from "../../../scripts/local-analyze-http.mjs";
import type { DashboardJob } from "../../../scripts/local-analyze-http.mjs";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

const APK =
  "https://github.com/appium/android-apidemos/releases/download/v6.0.18/ApiDemos-debug.apk";

const cookieFrom = (response: Response) => {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
  return cookies[0]?.split(";")[0] ?? "";
};

it("rejects proxy ports, private webhooks, and hidden jobs", () => {
  expect(bindAddress("127.0.0.1", 443).error).toContain("443");
  const bound = bindAddress("127.0.0.1", 4174);
  if (!("host" in bound)) throw new Error(bound.error);
  expect(bound.host).toBe("127.0.0.1");
  expect(publicHttpUrl("http://127.0.0.1/hook")).toBeUndefined();
  expect(publicHttpUrl("http://10.1.2.3/hook")).toBeUndefined();
  expect(publicHttpUrl("http://169.254.169.254/")).toBeUndefined();
  expect(publicHttpUrl("file:///etc/passwd")).toBeUndefined();
  expect(
    publicHttpUrl("https://discord.com/api/webhooks/1/abc")?.hostname,
  ).toBe("discord.com");
  expect(webhookRequest("http://127.0.0.1/hook", { id: "1" })).toBeUndefined();
  const jobs = new Map([
    ["own", { user: "ada" }],
    ["other", { user: "admin" }],
  ]);
  const guarded = guardJobs(jobs, { user: "ada", role: "operator" });
  expect(guarded.get("other")).toBeUndefined();
  expect(guarded.get("own")?.user).toBe("ada");
  guarded.set("added", { user: "ada" });
  expect(jobs.has("added")).toBe(true);
  expect(allowRequest("saas-limit", 2, 1000, 5)).toBe(true);
  expect(allowRequest("saas-limit", 2, 1000, 5)).toBe(true);
  expect(allowRequest("saas-limit", 2, 1000, 5)).toBe(false);
  const previous = process.env.REA_DEMO;
  process.env.REA_DEMO = "1";
  expect(demoAllowsTarget("/etc/passwd", "/tmp/uploads")).toBe(false);
  expect(demoAllowsTarget(APK, "/tmp/uploads")).toBe(true);
  expect(
    demoAllowsTarget("https://github.com/appium/android-apidemos", "/tmp"),
  ).toBe(true);
  if (previous === undefined) delete process.env.REA_DEMO;
  else process.env.REA_DEMO = previous;
});

it("signs a JWT and checks upload magic and sandbox cgroup flags", () => {
  const secret = "session-secret-value";
  const token = signJwt(secret, {
    user: "ada",
    role: "operator",
    exp: Date.now() + 60_000,
  });
  expect(token.split(".").length).toBe(3);
  expect(readJwt(secret, token)?.user).toBe("ada");
  expect(readJwt("another-secret-value", token)).toBeUndefined();
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]);
  expect(acceptedUpload("sample.apk", zip)).toBe(true);
  expect(acceptedUpload("sample.apk", Buffer.from("MZ\0\0not-a-zip"))).toBe(
    false,
  );
  const args = sandboxArgs({
    image: "rea-sandbox:local",
    memoryMb: 512,
    cpus: 1,
    repo: "/opt/rea-src",
    jobDir: "/tmp/rea-job",
    argv: ["node", "/opt/rea-src/scripts/rea.mjs", "doctor", "--json"],
    engines: {},
  });
  expect(args).toContain("--memory");
  expect(args).toContain("--cpus");
  expect(args).toContain("--network");
  expect(args).toContain("none");
  expect(args).toContain("512m");
});

it("hides another user's job and accepts a checked upload", async () => {
  resetLimits();
  const directory = await createTestTempDirectory("local-admin-saas-");
  const output = await createTestTempDirectory("local-admin-saas-out-");
  const admin = await openAdmin({
    directory,
    env: { REA_ADMIN_USER: "admin", REA_ADMIN_PASSWORD: "correct-password" },
  });
  const jobs = new Map<string, DashboardJob>();
  const started = await startLocalDashboard({
    options: { port: 0, output, baseOutput: output },
    jobs,
    dashboardPath: "scripts/local-analyze-dashboard.html",
    analyze: async (job) => {
      job.state = "done";
    },
    admin,
  });
  onTestFinished(() => started.close());
  const health = await fetch(`${started.url}api/health`);
  expect(health.status).toBe(200);
  expect(health.headers.get("x-content-type-options")).toBe("nosniff");
  expect(((await health.json()) as { ok: boolean }).ok).toBe(true);
  const signed = await fetch(`${started.url}api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "correct-password" }),
  });
  const adminCookie = cookieFrom(signed);
  const body = (await signed.json()) as { token?: string };
  expect(typeof body.token).toBe("string");
  const createdUser = await fetch(`${started.url}api/users`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      username: "ada",
      password: "operator-password",
      role: "user",
    }),
  });
  expect(createdUser.status).toBe(201);
  expect(((await createdUser.json()) as { role: string }).role).toBe(
    "operator",
  );
  const created = await fetch(`${started.url}api/analyze`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ target: "/tmp/rea-saas-sample", kind: "auto" }),
  });
  expect(created.status).toBe(202);
  const job = (await created.json()) as { id: string };
  const ada = await fetch(`${started.url}api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "ada", password: "operator-password" }),
  });
  const adaCookie = cookieFrom(ada);
  expect(
    (
      await fetch(`${started.url}api/jobs/${job.id}`, {
        headers: { cookie: adaCookie },
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await fetch(`${started.url}api/jobs/${job.id}`, {
        headers: { cookie: adminCookie },
      })
    ).status,
  ).toBe(200);
  const upload = await fetch(`${started.url}api/upload`, {
    method: "POST",
    headers: {
      cookie: adaCookie,
      "content-type": "application/octet-stream",
      "x-rea-filename": "sample.apk",
    },
    body: Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]),
  });
  expect(upload.status).toBe(202);
  const own = (await upload.json()) as { id: string; user?: string };
  expect(
    (
      await fetch(`${started.url}api/jobs/${own.id}`, {
        headers: { cookie: adaCookie },
      })
    ).status,
  ).toBe(200);
  const docs = await fetch(`${started.url}api/docs`);
  expect(docs.status).toBe(200);
  expect(await docs.text()).toContain("Sem planos");
});
