import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";

import {
  bearerMatches,
  hashPassword,
  readSessionToken,
  signSession,
  verifyPassword,
} from "../../../scripts/local-admin-auth.mjs";
import { pinnedDigest } from "../../../scripts/local-admin-pins.mjs";
import {
  canDeleteUser,
  openAdmin,
} from "../../../scripts/local-admin-store.mjs";
import { zipDirectory } from "../../../scripts/local-admin-zip.mjs";
import { startLocalDashboard } from "../../../scripts/local-analyze-http.mjs";
import type { DashboardJob } from "../../../scripts/local-analyze-http.mjs";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

const APK =
  "https://github.com/appium/android-apidemos/releases/download/v6.0.18/ApiDemos-debug.apk";
const APK_SHA =
  "a9eecf37b26cd084855c530db81c2bb1b91f4c1b095a04f47aa7c20e2791f686";

it("checks a password, a session mac, and a bearer token", async () => {
  const stored = await hashPassword("correct-password");
  expect(await verifyPassword("correct-password", stored)).toBe(true);
  expect(await verifyPassword("other-password", stored)).toBe(false);
  const secret = "session-secret-value";
  const token = signSession(secret, {
    user: "admin",
    role: "admin",
    exp: Date.now() + 60_000,
  });
  expect(readSessionToken(secret, token)?.user).toBe("admin");
  expect(readSessionToken(secret, `${token}x`)).toBeUndefined();
  expect(readSessionToken("another-secret-value", token)).toBeUndefined();
  expect(bearerMatches("Bearer short", "short")).toBe(false);
  expect(bearerMatches("Bearer 1234567890abcdef", "1234567890abcdef")).toBe(
    true,
  );
  expect(bearerMatches("Bearer 1234567890abcdef", "1234567890abcdeg")).toBe(
    false,
  );
});

it("keeps the environment admin and the pinned practice APK", async () => {
  expect(
    canDeleteUser(
      [
        { id: "env-admin", role: "admin", disabled: false },
        { id: "op", role: "operator", disabled: false },
      ],
      "env-admin",
    ),
  ).toBe(false);
  expect(
    canDeleteUser([{ id: "only", role: "admin", disabled: false }], "only"),
  ).toBe(false);
  expect(
    canDeleteUser(
      [
        { id: "env-admin", role: "admin", disabled: false },
        { id: "op", role: "operator", disabled: false },
      ],
      "op",
    ),
  ).toBe(true);
  expect(pinnedDigest(APK)).toBe(APK_SHA);
  expect(pinnedDigest("https://example.com/app.apk")).toBeUndefined();

  const directory = await createTestTempDirectory("local-admin-store-");
  const first = await openAdmin({ directory, env: {} });
  expect(first.generatedPassword.length).toBeGreaterThan(8);
  const second = await openAdmin({ directory, env: {} });
  expect(second.generatedPassword).toBe("");
  const user = await second.authenticate("admin", first.generatedPassword);
  expect(user?.username).toBe("admin");
  expect(second.listTargets().some((item) => item.target === APK)).toBe(true);
  expect((await second.deleteUser("env-admin")).error).toBeTruthy();
  expect(
    (await second.updateUser("env-admin", { disabled: true })).error,
  ).toBeTruthy();
  const zipDir = await createTestTempDirectory("local-admin-zip-");
  await writeFile(join(zipDir, "hello.txt"), "hello");
  const zip = await zipDirectory(zipDir);
  expect(zip.subarray(0, 4).toString("hex")).toBe("504b0304");
  expect(zip.includes(Buffer.from("hello.txt"))).toBe(true);
});

const cookieFrom = (response: Response) => {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
  return cookies[0]?.split(";")[0] ?? "";
};

const waitForState = async (url: string, cookie: string, id: string) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${url}api/jobs/${id}`, {
      headers: { cookie },
    });
    const job = (await response.json()) as { state?: string };
    if (
      job.state === "cancelled" ||
      job.state === "done" ||
      job.state === "failed"
    )
      return job.state;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return "timeout";
};

it("requires a local session before analysis, cancel, and export", async () => {
  const previous = process.env.REA_ADMIN_TOKEN;
  process.env.REA_ADMIN_TOKEN = "local-admin-token1";
  onTestFinished(() => {
    if (previous === undefined) delete process.env.REA_ADMIN_TOKEN;
    else process.env.REA_ADMIN_TOKEN = previous;
  });
  const directory = await createTestTempDirectory("local-admin-http-");
  const output = await createTestTempDirectory("local-admin-out-");
  const admin = await openAdmin({
    directory,
    env: { REA_ADMIN_USER: "admin", REA_ADMIN_PASSWORD: "correct-password" },
  });
  const jobs = new Map<string, DashboardJob>();
  const analyze = (job: DashboardJob) =>
    new Promise<void>((resolve) => {
      if (job.abort?.signal.aborted) {
        job.state = "cancelled";
        resolve();
        return;
      }
      job.state = "running";
      const timer = setTimeout(() => {
        job.state = "done";
        job.headline = "ok";
        resolve();
      }, 4000);
      job.abort?.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        job.state = "cancelled";
        resolve();
      });
    });
  const started = await startLocalDashboard({
    options: { port: 0, output, baseOutput: output },
    jobs,
    dashboardPath: join(process.cwd(), "scripts/local-analyze-dashboard.html"),
    analyze,
    admin,
    runRea: async () => ({ ok: true, stdout: '{"healthy":true}', stderr: "" }),
    commandExists: async () => false,
  });
  onTestFinished(() => started.close());
  const page = await fetch(started.url);
  expect(page.status).toBe(200);
  expect(await page.text()).toContain('id="login"');
  expect((await fetch(`${started.url}api/jobs`)).status).toBe(401);

  const rejected = await fetch(`${started.url}api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "wrong-password" }),
  });
  expect(rejected.status).toBe(401);
  const signed = await fetch(`${started.url}api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "correct-password" }),
  });
  expect(signed.status).toBe(200);
  const cookie = cookieFrom(signed);
  expect(cookie.startsWith("rea_session=")).toBe(true);

  const created = await fetch(`${started.url}api/analyze`, {
    method: "POST",
    headers: {
      authorization: "Bearer local-admin-token1",
      "content-type": "application/json",
    },
    body: JSON.stringify({ target: "/tmp/rea-admin-sample", kind: "auto" }),
  });
  expect(created.status).toBe(202);
  const job = (await created.json()) as { id: string };
  expect(
    (
      await fetch(`${started.url}api/users/env-admin`, {
        method: "DELETE",
        headers: { authorization: "Bearer local-admin-token1" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(`${started.url}api/jobs/${job.id}/cancel`, {
        method: "POST",
        headers: { cookie },
      })
    ).status,
  ).toBe(200);
  expect(await waitForState(started.url, cookie, job.id)).toBe("cancelled");
  await writeFile(join(output, job.id, "note.txt"), "hello");
  const zip = await fetch(`${started.url}api/jobs/${job.id}/export.zip`, {
    headers: { cookie },
  });
  expect(zip.status).toBe(200);
  const bytes = Buffer.from(await zip.arrayBuffer());
  expect(bytes.subarray(0, 4).toString("hex")).toBe("504b0304");
  expect(bytes.includes(Buffer.from("note.txt"))).toBe(true);
});
