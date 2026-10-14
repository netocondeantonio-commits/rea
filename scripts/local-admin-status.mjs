import { mergedEnv } from "./local-analyze-jobs.mjs";

/** Home cards. Doctor is cached. Frida lists devices and is not attached. */

let cache = { at: 0, value: undefined };

const parseDoctor = (result) => {
  if (!result) return { ready: false, detail: "unavailable" };
  let parsed;
  try {
    parsed = JSON.parse(String(result.stdout ?? "").trim() || "null");
  } catch {
    parsed = undefined;
  }
  const body =
    parsed && typeof parsed === "object" && parsed.evidence
      ? parsed.evidence
      : parsed;
  const healthy = Boolean(
    body && typeof body === "object" && body.healthy === true,
  );
  if (!result.ok) return { ready: false, detail: "unavailable" };
  return { ready: healthy, detail: healthy ? "healthy" : "not-healthy" };
};

const flag = (ready, detail) => ({ ready, detail });

export const engineStatus = async ({ runRea, commandExists }) => {
  const env = mergedEnv();
  const now = Date.now();
  if (cache.value === undefined || now - cache.at > 60_000) {
    const result = runRea
      ? await runRea(["doctor"], 120_000)
      : { ok: false, stdout: "", stderr: "" };
    cache = { at: now, value: parseDoctor(result) };
  }
  const exists = commandExists ?? (async () => false);
  const rizin = env.REA_RIZIN_COMMAND || "rizin";
  const apktool = env.REA_APKTOOL_COMMAND || "apktool";
  return {
    ghidra: flag((env.GHIDRA_INSTALL_DIR ?? "").length > 0, "path"),
    jadx: flag((env.REA_JADX_MCP_JAR ?? "").length > 0, "path"),
    rizin: flag(await exists(rizin), "command"),
    apktool: flag(await exists(apktool), "decode"),
    frida: flag(await exists("frida"), "inspect"),
    doctor: cache.value,
  };
};
