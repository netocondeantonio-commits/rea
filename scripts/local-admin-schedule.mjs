import { isDue } from "./local-admin-extra.mjs";
import { deliverWebhook } from "./local-admin-report-export.mjs";
import { createJob, enqueueJob, saveIndex } from "./local-analyze-jobs.mjs";

/** Re-runs saved targets while this process stays up. It stops with the page. */

const busyFor = (jobs, id) =>
  [...jobs.values()].some(
    (job) =>
      job.scheduleTargetId === id &&
      (job.state === "queued" || job.state === "running"),
  );

const sendNotice = async (admin, settings, job, user) => {
  const url = settings.webhookUrl ?? "";
  if (url.length === 0) return;
  const result = await deliverWebhook(url, job, settings.telegramChatId);
  await admin.audit({
    user: String(user).slice(0, 32),
    action: "webhook",
    detail: String(result.status),
  });
};

export const notifyJobFinished = async (admin, job) => {
  const settings = admin.readSettings();
  if (job.scheduleTargetId && job.digest) {
    const target = admin
      .listTargets()
      .find((item) => item.id === job.scheduleTargetId);
    const previous =
      typeof target?.lastDigest === "string" ? target.lastDigest : "";
    await admin.patchTarget(job.scheduleTargetId, { lastDigest: job.digest });
    if (previous.length > 0 && previous !== job.digest) {
      await admin.audit({
        user: "schedule",
        action: "schedule.changed",
        detail: job.id,
      });
      await sendNotice(admin, settings, job, "schedule");
    }
    return;
  }
  await sendNotice(admin, settings, job, job.user ?? "cli");
};

const enqueueDue = async ({ admin, jobs, output, analyze }) => {
  const now = Date.now();
  const settings = admin.readSettings();
  for (const target of admin.listTargets()) {
    if (!isDue(target, now, busyFor(jobs, target.id))) continue;
    const job = createJob(output(), target.target, {
      kind: target.kind,
      user: "schedule",
      scheduleTargetId: target.id,
      cpuNice: settings.cpuNice,
      ramLimitMb: settings.ramLimitMb,
    });
    jobs.set(job.id, job);
    await saveIndex(job);
    enqueueJob(job, analyze);
    await admin.patchTarget(target.id, {
      everyMinutes: target.everyMinutes,
      nextRun: new Date(now + target.everyMinutes * 60_000).toISOString(),
    });
    await admin.audit({
      user: "schedule",
      action: "schedule.run",
      detail: target.id,
    });
  }
};

export const startSchedule = (deps) => {
  const timer = setInterval(() => {
    enqueueDue(deps).catch(() => {});
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
};
