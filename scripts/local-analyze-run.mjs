import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { attachEvidence, gateFast } from "./local-admin-extra.mjs";
import { downloadPinned, pinnedDigest } from "./local-admin-pins.mjs";
import {
  mergedEnv,
  saveIndex,
  setResourceLimits,
  writeJobFile,
} from "./local-analyze-jobs.mjs";
import { writeLocalPackage } from "./local-analyze-package.mjs";
import { writeLocalReport } from "./local-analyze-report.mjs";

/** Runs one queued analysis. Call `bindLocalAnalyzer` before `analyze`. */

const execFileAsync = promisify(execFile);
const githubUrl =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/u;

let tools = {};

export const bindLocalAnalyzer = (next) => {
  tools = next;
};

const isAbort = (cause) =>
  cause?.name === "AbortError" || cause?.code === "ABORT_ERR";

const persist = async (job) => {
  try {
    await writeLocalPackage(job, {
      runRea: tools.runRea,
      commandExists: tools.commandExists,
    });
  } catch (cause) {
    job.events.push({
      message: `Pacote bilíngue não foi escrito: ${cause instanceof Error ? cause.message : cause}`,
    });
  }
  await writeLocalReport(job);
  await attachLocalEvidence(job);
  await writeJobFile(job);
  await saveIndex(job);
};

const attachLocalEvidence = async (job) => {
  try {
    const secret =
      typeof tools.integritySecret === "function"
        ? tools.integritySecret()
        : "";
    const extra = await attachEvidence(job.directory, job, secret);
    job.digest = extra.digest;
    job.signature = extra.signature;
    job.checklist = extra.checklist;
  } catch (cause) {
    job.events.push({
      message: `Hashes não escritos: ${cause instanceof Error ? cause.message : cause}`,
    });
  }
};

const finishHook = async (job) => {
  if (job.finishedNotified || typeof tools.onFinished !== "function") return;
  job.finishedNotified = true;
  try {
    await tools.onFinished(job);
  } catch {
    job.events.push({ message: "Aviso de conclusão não foi enviado." });
  }
};

const failJob = async (job, detected, message, note) => {
  job.detected = detected;
  note(message);
  note("Escrevendo o pacote em português e inglês");
  await mkdir(job.directory, { recursive: true });
  await persist(job);
  job.state = "failed";
  await writeJobFile(job);
  await saveIndex(job);
  await finishHook(job);
};

const markCancelled = async (job, note) => {
  job.state = "cancelled";
  if (job.events.at(-1)?.message !== "Cancelado.") note("Cancelado.");
  await persist(job);
  await finishHook(job);
};

const githubRejected = (owner, repo) =>
  owner === "." ||
  owner === ".." ||
  repo === "." ||
  repo === ".." ||
  owner.includes("..") ||
  repo.includes("..");

const finishCancelled = async (job, note, cause) => {
  if (!isAbort(cause) && !job.abort?.signal.aborted) return false;
  await markCancelled(job, note);
  return true;
};

const resolvePinned = async (job, note, target) => {
  if (pinnedDigest(target) === undefined) return null;
  note("Baixando o APK de prática com hash fixado");
  await mkdir(job.directory, { recursive: true });
  try {
    return await downloadPinned(target, job.directory, job.abort?.signal);
  } catch (cause) {
    if (await finishCancelled(job, note, cause)) return undefined;
    await failJob(
      job,
      "apk",
      cause instanceof Error ? cause.message : String(cause),
      note,
    );
    return undefined;
  }
};

const cloneGithub = async (job, note, target) => {
  const destination = join(job.directory, "source");
  note(`Clonando ${job.target}`);
  await mkdir(job.directory, { recursive: true });
  const gitOptions = {
    timeout: 120_000,
    env: { ...mergedEnv(), GIT_TERMINAL_PROMPT: "0" },
  };
  if (job.abort?.signal) gitOptions.signal = job.abort.signal;
  try {
    await execFileAsync(
      "git",
      ["clone", "--depth", "1", "--", target, destination],
      gitOptions,
    );
  } catch (cause) {
    if (await finishCancelled(job, note, cause)) return undefined;
    await failJob(
      job,
      "github",
      cause instanceof Error ? cause.message : String(cause),
      note,
    );
    return undefined;
  }
  return destination;
};

const resolveSource = async (job, note) => {
  const target = job.target.trim();
  const pinned = await resolvePinned(job, note, target);
  if (pinned !== null) return pinned;
  const match = githubUrl.exec(target);
  if (match !== null) {
    if (githubRejected(match[1], match[2])) {
      await failJob(job, "github", "URL do GitHub recusada.", note);
      return undefined;
    }
    return cloneGithub(job, note, target);
  }
  if (/^https?:\/\//u.test(target)) {
    await failJob(
      job,
      "url",
      "Só URLs https://github.com/org/repo são aceitas, além do APK de prática com hash fixado.",
      note,
    );
    return undefined;
  }
  const source = resolve(job.target);
  if (!(await tools.exists(source))) {
    await failJob(job, "ausente", `Caminho não encontrado: ${source}`, note);
    return undefined;
  }
  return source;
};

const chosenKind = async (job, source, note) => {
  const detected = await tools.detectTarget(source);
  if (!job.kind || job.kind === "auto") {
    note(`Tipo detectado: ${detected}`);
    return detected;
  }
  note(`Tipo escolhido: ${job.kind}. A detecção automática foi ${detected}.`);
  return job.kind === "dotnet" ? "pe" : job.kind;
};

const recordStep = async (job, step, note) => {
  note(`Rodando ${step.title}`);
  const result =
    step.precomputed ??
    (await tools.runRea(step.args, step.timeoutMs, job.abort?.signal));
  if (result.cancelled) return "cancelled";
  job.steps.push({
    ...step,
    ok: result.ok,
    facts: tools.factsFrom(tools.parseJson(result.stdout)),
    stderr: result.stderr,
  });
  await writeFile(
    join(job.directory, "evidence", `${step.id}.json`),
    result.stdout.length > 0
      ? result.stdout
      : `${JSON.stringify({ ok: false, stderr: result.stderr })}\n`,
  );
  note(result.ok ? `${step.title} concluído` : `${step.title} falhou`);
  return "ok";
};

const runAnalysis = async (job, onUpdate) => {
  const note = (message) => {
    job.events.push({ message });
    onUpdate();
  };
  if (job.abort?.signal.aborted) {
    await markCancelled(job, note);
    return;
  }
  job.state = "running";
  await saveIndex(job);
  const source = await resolveSource(job, note);
  if (source === undefined) return;
  job.resolved = source;
  job.detected = await chosenKind(job, source, note);
  await mkdir(join(job.directory, "evidence"), { recursive: true });
  const gated = gateFast(job.fast === true, job.detected);
  const steps = gated.usePlan
    ? await tools.planSteps(job.detected, source, job.abort?.signal)
    : [{ id: "fast-unsupported", title: "Modo rápido", skip: gated.skip }];
  if (job.abort?.signal.aborted) {
    await markCancelled(job, note);
    return;
  }
  for (const step of steps) {
    if (job.abort?.signal.aborted) {
      await markCancelled(job, note);
      return;
    }
    if (step.skip !== undefined) {
      job.steps.push(step);
      note(step.skip);
      continue;
    }
    if ((await recordStep(job, step, note)) === "cancelled") {
      await markCancelled(job, note);
      return;
    }
  }
  note("Escrevendo o pacote em português e inglês");
  await persist(job);
  if (job.abort?.signal.aborted) {
    job.state = "cancelled";
    await writeJobFile(job);
    await saveIndex(job);
    await finishHook(job);
    return;
  }
  job.state = job.steps.some((step) => step.ok) ? "done" : "failed";
  await writeJobFile(job);
  await saveIndex(job);
  await finishHook(job);
};

export const analyze = async (job, onUpdate) => {
  setResourceLimits({ cpuNice: job.cpuNice ?? 0 });
  try {
    await runAnalysis(job, onUpdate);
  } finally {
    setResourceLimits({ cpuNice: 0 });
  }
};
