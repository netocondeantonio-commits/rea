import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { publicHttpUrl } from "./local-admin-access.mjs";
import {
  hashPassword,
  randomPassword,
  verifyPassword,
} from "./local-admin-auth.mjs";
import { pinnedDigest } from "./local-admin-pins.mjs";
import { applySandboxSettings, sandboxFields } from "./local-admin-sandbox.mjs";

export const ENGINE_KEYS = Object.freeze([
  "GHIDRA_INSTALL_DIR",
  "JAVA_HOME",
  "REA_JADX_MCP_JAR",
  "REA_RIZIN_COMMAND",
  "REA_OBJDUMP_COMMAND",
  "REA_GDB_COMMAND",
  "GHIDRA_MCP_BIN",
  "REA_APKTOOL_COMMAND",
]);

const USERNAME = /^[A-Za-z0-9._-]{1,32}$/u;
const ROLES = new Set(["admin", "operator"]);
const KINDS = ["auto", "javascript", "android", "native", "website", "dotnet"];
const ERRORS = {
  username: ["Nome de usuário inválido.", "Invalid username."],
  exists: ["Esse nome já existe.", "That name already exists."],
  password: [
    "A senha precisa de 8 caracteres.",
    "The password needs 8 characters.",
  ],
  role: ["Papel inválido.", "Invalid role."],
  missing: ["Usuário não encontrado.", "User not found."],
  lastAdmin: ["Mantenha um administrador.", "Keep one administrator."],
  envAdmin: [
    "O administrador do ambiente não pode ser desativado.",
    "The environment administrator cannot be disabled.",
  ],
  locked: [
    "Esse usuário não pode ser removido.",
    "That user cannot be removed.",
  ],
  target: ["Informe um caminho ou URL.", "Enter a path or URL."],
  schedule: [
    "O intervalo mínimo é 15 minutos.",
    "The shortest interval is 15 minutes.",
  ],
};

const reject = (key) => ({ error: ERRORS[key][0], error_en: ERRORS[key][1] });

const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (cause) {
    if (cause?.code === "ENOENT") return fallback;
    throw cause;
  }
};

const readText = async (path) => {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch (cause) {
    if (cause?.code === "ENOENT") return "";
    throw cause;
  }
};

const emptyEngines = () =>
  Object.fromEntries(ENGINE_KEYS.map((key) => [key, ""]));

export const seedTargets = () => [
  {
    id: "apidemos-repo",
    name: "Appium ApiDemos repository",
    target: "https://github.com/appium/android-apidemos",
    kind: "auto",
    pinned: false,
    note_pt:
      "Repositório público de prática. O clone é o código, não o APK pronto.",
    note_en:
      "Public practice repository. The clone is the source, not the built APK.",
    owner: "shared",
  },
  {
    id: "apidemos-apk",
    name: "ApiDemos APK 6.0.18",
    target:
      "https://github.com/appium/android-apidemos/releases/download/v6.0.18/ApiDemos-debug.apk",
    kind: "android",
    pinned: true,
    note_pt:
      "APK de prática com SHA-256 fixado. A análise só baixa este endereço.",
    note_en:
      "Practice APK with a pinned SHA-256. Analysis downloads only this address.",
    owner: "shared",
  },
];

const normalizeTarget = (row) => {
  const owner = typeof row?.owner === "string" ? row.owner : "";
  return { ...row, owner: USERNAME.test(owner) ? owner : "shared" };
};

const storedRole = (role) => (role === "user" ? "operator" : role);

const normalizeUser = (user) => ({
  id: String(user.id),
  username: String(user.username),
  role: user.role === "admin" ? "admin" : "operator",
  disabled: user.disabled === true,
  passwordHash: String(user.passwordHash ?? ""),
});

export const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  role: user.role,
  disabled: user.disabled === true,
});

export const canDeleteUser = (users, id) => {
  const target = users.find((user) => user.id === id);
  if (!target || target.id === "env-admin") return false;
  const admins = users.filter(
    (user) => user.role === "admin" && !user.disabled,
  );
  if (target.role === "admin" && admins.length <= 1) return false;
  return true;
};

const activeAdmins = (users) =>
  users.filter((user) => user.role === "admin" && !user.disabled);

const ensureEnvAdmin = async (users, env) => {
  const username = env.user || "admin";
  const admin =
    users.find((user) => user.id === "env-admin") ??
    users.find((user) => user.username === username);
  if (!env.password && admin) return { users, generated: "" };
  if (
    admin &&
    env.password &&
    admin.username === username &&
    admin.role === "admin" &&
    !admin.disabled &&
    (await verifyPassword(env.password, admin.passwordHash))
  )
    return { users, generated: "" };
  const password = env.password || randomPassword();
  const next = {
    id: "env-admin",
    username,
    role: "admin",
    disabled: false,
    passwordHash: await hashPassword(password),
  };
  return {
    users: [
      next,
      ...users.filter(
        (user) => user.id !== "env-admin" && user.username !== username,
      ),
    ],
    generated: env.password ? "" : password,
  };
};

const cleanEngines = (value) => {
  const engines = emptyEngines();
  if (!value || typeof value !== "object") return engines;
  for (const key of ENGINE_KEYS) {
    const field = value[key];
    if (typeof field === "string") engines[key] = field.trim().slice(0, 400);
  }
  return engines;
};

const loadSecret = async (path, env) => {
  let secret = env.REA_ADMIN_SESSION_SECRET || "";
  if (secret.length >= 16) return secret;
  secret = await readText(path);
  if (secret.length >= 16) return secret;
  secret = randomBytes(24).toString("hex");
  await writeFile(path, secret, { mode: 0o600 });
  return secret;
};

const applyUserPatch = async (users, id, input) => {
  const current = users.find((user) => user.id === id);
  if (!current) return { error: reject("missing") };
  const next = { ...current };
  if (input.role !== undefined) {
    const role = storedRole(input.role);
    if (!ROLES.has(role)) return { error: reject("role") };
    if (
      current.role === "admin" &&
      role !== "admin" &&
      activeAdmins(users).length <= 1
    )
      return { error: reject("lastAdmin") };
    next.role = role;
  }
  if (input.disabled === true) {
    if (current.id === "env-admin") return { error: reject("envAdmin") };
    if (
      current.role === "admin" &&
      !current.disabled &&
      activeAdmins(users).length <= 1
    )
      return { error: reject("lastAdmin") };
    next.disabled = true;
  }
  if (input.disabled === false) next.disabled = false;
  if (typeof input.password === "string" && input.password.length > 0) {
    if (input.password.length < 8) return { error: reject("password") };
    next.passwordHash = await hashPassword(input.password);
  }
  return { next };
};

const userApi = (state, save) => ({
  authenticate: async (username, password) => {
    const user = state.users.find(
      (item) => item.username === username && !item.disabled,
    );
    if (!user || !(await verifyPassword(password, user.passwordHash)))
      return undefined;
    return publicUser(user);
  },
  listUsers: () => state.users.map(publicUser),
  createUser: async (input) => {
    const username = String(input.username ?? "").trim();
    if (!USERNAME.test(username)) return reject("username");
    if (state.users.some((user) => user.username === username))
      return reject("exists");
    if (typeof input.password !== "string" || input.password.length < 8)
      return reject("password");
    const role = storedRole(input.role);
    if (!ROLES.has(role)) return reject("role");
    const user = {
      id: randomBytes(4).toString("hex"),
      username,
      role,
      disabled: false,
      passwordHash: await hashPassword(input.password),
    };
    state.users = [...state.users, user];
    await save();
    return { user: publicUser(user) };
  },
  updateUser: async (id, input) => {
    const patched = await applyUserPatch(state.users, id, input);
    if (patched.error) return patched.error;
    state.users = state.users.map((user) =>
      user.id === id ? patched.next : user,
    );
    await save();
    return { user: publicUser(patched.next) };
  },
  deleteUser: async (id) => {
    if (!canDeleteUser(state.users, id)) return reject("locked");
    state.users = state.users.filter((user) => user.id !== id);
    await save();
    return { ok: true };
  },
});

const targetApi = (state, save) => ({
  listTargets: () => state.targets,
  addTarget: async (input) => {
    const target = String(input.target ?? "").trim();
    if (target.length === 0 || target.includes("\0")) return reject("target");
    const row = {
      id: randomBytes(4).toString("hex"),
      name: String(input.name ?? target).slice(0, 80),
      target: target.slice(0, 400),
      kind: KINDS.includes(input.kind) ? input.kind : "auto",
      note_pt: String(input.note_pt ?? "").slice(0, 240),
      note_en: String(input.note_en ?? "").slice(0, 240),
      pinned: pinnedDigest(target) !== undefined,
      owner: USERNAME.test(String(input.owner ?? ""))
        ? String(input.owner)
        : "shared",
    };
    state.targets = [row, ...state.targets].slice(0, 100);
    await save();
    return { target: row };
  },
  removeTarget: async (id) => {
    state.targets = state.targets.filter((item) => item.id !== id);
    await save();
    return { ok: true };
  },
  patchTarget: async (id, input) => patchTarget(state, save, id, input),
});

const clampInt = (value, max) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > max) return 0;
  return number;
};

const storedWebhook = (value) => {
  const url = publicHttpUrl(value);
  return url ? url.toString() : "";
};

const storedChat = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^-?[0-9]{1,32}$/u.test(trimmed) ? trimmed : "";
};

const normalizeSettings = (value) => ({
  outputDir: typeof value.outputDir === "string" ? value.outputDir : "",
  language: value.language === "en" ? "en" : "pt-BR",
  theme: value.theme === "dark" ? "dark" : "light",
  engines: cleanEngines(value.engines),
  webhookUrl: storedWebhook(value.webhookUrl),
  telegramChatId: storedChat(value.telegramChatId),
  cpuNice: clampInt(value.cpuNice, 19),
  ramLimitMb: clampInt(value.ramLimitMb, 65536),
  ...sandboxFields(value),
});

const applySchedule = (next, input) => {
  if (input.everyMinutes === 0 || input.everyMinutes === null) {
    delete next.everyMinutes;
    delete next.nextRun;
    return { ok: true };
  }
  if (input.everyMinutes === undefined) {
    if (typeof input.nextRun === "string") next.nextRun = input.nextRun;
    return { ok: true };
  }
  const minutes = Number(input.everyMinutes);
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 10_080)
    return reject("schedule");
  next.everyMinutes = minutes;
  next.nextRun =
    typeof input.nextRun === "string"
      ? input.nextRun
      : new Date(Date.now() + minutes * 60_000).toISOString();
  return { ok: true };
};

const patchTarget = async (state, save, id, input) => {
  const current = state.targets.find((item) => item.id === id);
  if (!current) return reject("missing");
  const next = { ...current };
  const scheduled = applySchedule(next, input);
  if (scheduled.error) return scheduled;
  if (typeof input.lastDigest === "string")
    next.lastDigest = input.lastDigest.slice(0, 64);
  state.targets = state.targets.map((item) => (item.id === id ? next : item));
  await save();
  return { target: next };
};

const applyAdminSettings = (next, input, previous) => {
  if (typeof input.outputDir === "string" && !input.outputDir.includes("\0"))
    next.outputDir = input.outputDir.trim().slice(0, 400);
  if (input.engines && typeof input.engines === "object")
    next.engines = cleanEngines({ ...previous.engines, ...input.engines });
  if (typeof input.webhookUrl === "string")
    next.webhookUrl =
      input.webhookUrl.trim().length === 0
        ? ""
        : storedWebhook(input.webhookUrl) || previous.webhookUrl;
  if (typeof input.telegramChatId === "string")
    next.telegramChatId = storedChat(input.telegramChatId);
  if (input.cpuNice !== undefined) next.cpuNice = clampInt(input.cpuNice, 19);
  if (input.ramLimitMb !== undefined)
    next.ramLimitMb = clampInt(input.ramLimitMb, 65536);
  applySandboxSettings(next, input);
};

const settingsApi = (state, save) => ({
  readSettings: () => state.settings,
  writeSettings: async (input, role) => {
    const next = { ...state.settings, engines: { ...state.settings.engines } };
    if (input.language === "en" || input.language === "pt-BR")
      next.language = input.language;
    if (input.theme === "dark" || input.theme === "light")
      next.theme = input.theme;
    if (role === "admin") applyAdminSettings(next, input, state.settings);
    state.settings = next;
    await save();
    return state.settings;
  },
  engineEnv: () => {
    const env = {};
    for (const [key, value] of Object.entries(state.settings.engines)) {
      if (value) env[key] = value;
    }
    return env;
  },
});

export const openAdmin = async ({ directory, env = process.env }) => {
  await mkdir(directory, { recursive: true });
  const usersPath = join(directory, "users.json");
  const settingsPath = join(directory, "settings.json");
  const targetsPath = join(directory, "targets.json");
  const auditPath = join(directory, "audit.jsonl");
  const secret = await loadSecret(join(directory, "session-secret"), env);
  const loaded = await readJson(usersPath, []);
  const ensured = await ensureEnvAdmin(
    Array.isArray(loaded) ? loaded.map(normalizeUser) : [],
    {
      user: env.REA_ADMIN_USER ?? "admin",
      password: env.REA_ADMIN_PASSWORD ?? "",
    },
  );
  const state = {
    users: ensured.users,
    settings: normalizeSettings(await readJson(settingsPath, {})),
    targets: await readJson(targetsPath, null),
  };
  if (Array.isArray(state.targets))
    state.targets = state.targets.map(normalizeTarget);
  await writeFile(usersPath, `${JSON.stringify(state.users, null, 2)}\n`, {
    mode: 0o600,
  });
  if (!Array.isArray(state.targets)) {
    state.targets = seedTargets();
    await writeFile(targetsPath, `${JSON.stringify(state.targets, null, 2)}\n`);
  }
  const saveUsers = async () => {
    await writeFile(usersPath, `${JSON.stringify(state.users, null, 2)}\n`, {
      mode: 0o600,
    });
  };
  const saveSettings = async () => {
    await writeFile(
      settingsPath,
      `${JSON.stringify(state.settings, null, 2)}\n`,
    );
  };
  const saveTargets = async () => {
    await writeFile(targetsPath, `${JSON.stringify(state.targets, null, 2)}\n`);
  };
  return {
    directory,
    secret,
    generatedPassword: ensured.generated,
    ...userApi(state, saveUsers),
    ...targetApi(state, saveTargets),
    ...settingsApi(state, saveSettings),
    audit: async (entry) => {
      const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
      await appendFile(auditPath, `${line}\n`);
    },
    listAudit: async () => readAudit(auditPath),
  };
};

const readAudit = async (path) => {
  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch (cause) {
    if (cause?.code === "ENOENT") return [];
    throw cause;
  }
  return text
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .slice(-100)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { at: "", action: "unreadable" };
      }
    })
    .reverse();
};
