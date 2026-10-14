/** Step lists for the local admin pipeline. No model, and no process attach. */

const step = (id, title, args, timeoutMs) => ({
  id,
  title,
  args,
  timeoutMs,
});

const skip = (id, title, note) => ({ id, title, skip: note });

const configured = (env, key) =>
  typeof env?.[key] === "string" ? env[key] : "";

const fridaStep = async (commandExists) => {
  if (!(await commandExists("frida"))) return undefined;
  return step(
    "frida-devices",
    "Frida dispositivos",
    ["list-frida-devices"],
    30_000,
  );
};

const planNative = async (path, notes, tools) => {
  const steps = [];
  const current = tools.mergedEnv();
  for (const note of notes) steps.push(skip("note", "Nota", note));
  const objdump = configured(current, "REA_OBJDUMP_COMMAND") || "objdump";
  if (await tools.commandExists(objdump))
    steps.push(
      step(
        "objdump",
        "objdump",
        ["inspect-with-objdump", path, "file_headers"],
        60_000,
      ),
    );
  const rizin = configured(current, "REA_RIZIN_COMMAND") || "rizin";
  if (await tools.commandExists(rizin)) {
    steps.push(
      step("rizin", "Rizin", ["execute-rizin-command", path, "iI"], 60_000),
    );
    steps.push(
      step(
        "rizin-strings",
        "Rizin strings",
        ["execute-rizin-command", path, "iz"],
        60_000,
      ),
    );
  }
  if (configured(current, "GHIDRA_INSTALL_DIR").length > 0)
    steps.push(
      step(
        "ghidra",
        "Ghidra",
        ["analyze", path, "--provider", "ghidra"],
        300_000,
      ),
    );
  else
    steps.push(
      skip(
        "ghidra-missing",
        "Ghidra",
        "GHIDRA_INSTALL_DIR não está definido. A visão estática acima não substitui a descompilação.",
      ),
    );
  const frida = await fridaStep(tools.commandExists);
  if (frida) steps.push(frida);
  return steps;
};

const planAndroid = async (path, tools) => {
  const current = tools.mergedEnv();
  const launcher = configured(current, "REA_APKTOOL_COMMAND") || "apktool";
  const steps = [];
  if (await tools.commandExists(launcher)) {
    steps.push(
      step("apktool-client", "Apktool", ["inspect-apktool-client"], 60_000),
    );
    steps.push(
      step(
        "apktool-resources",
        "Recursos Android",
        ["decode-android-resources", path],
        180_000,
      ),
    );
  } else
    steps.push(
      skip(
        "apktool-missing",
        "Apktool",
        "Defina REA_APKTOOL_COMMAND com um caminho absoluto ou instale apktool. Sem isso, o manifesto não é decodificado.",
      ),
    );
  if (configured(current, "REA_JADX_MCP_JAR").length > 0)
    steps.push(
      step(
        "android",
        "Pacote Android",
        ["inspect-android-package", path],
        180_000,
      ),
    );
  else
    steps.push(
      skip(
        "android-missing",
        "APK sem JADX",
        "Defina REA_JADX_MCP_JAR para o JAR jadx-headless-mcp 0.7.1. O painel não baixa esse arquivo.",
      ),
    );
  const frida = await fridaStep(tools.commandExists);
  if (frida) steps.push(frida);
  return steps;
};

const planSteps = async (kind, path, signal, tools) => {
  if (kind === "javascript")
    return [
      step(
        "javascript",
        "Aplicativo JavaScript",
        ["analyze-javascript-application", path],
        180_000,
      ),
    ];
  if (kind === "android") return planAndroid(path, tools);
  if (kind === "website")
    return [
      skip(
        "website",
        "Site estático",
        "Há um index.html e nenhum package.json. Observar a página no navegador precisa de um Chrome com porta de depuração. Este caminho não abre navegador.",
      ),
    ];
  if (kind === "pe") {
    const managed = await tools.runRea(
      ["inspect-managed-artifact", path],
      60_000,
      signal,
    );
    if (managed.ok)
      return [
        {
          id: "dotnet",
          title: "Assembly .NET",
          precomputed: managed,
          args: ["inspect-managed-artifact", path],
        },
      ];
    return planNative(
      path,
      [
        "O arquivo PE não foi aceito como assembly .NET. Seguindo com inspeção nativa.",
      ],
      tools,
    );
  }
  if (kind === "native") return planNative(path, [], tools);
  return [
    skip(
      "unknown",
      "Tipo não reconhecido",
      "Use um diretório com package.json, um APK, um binário nativo, um assembly .NET ou um repositório GitHub que contenha um desses alvos.",
    ),
  ];
};

export const createPlan = (tools) => ({
  planSteps: (kind, path, signal) => planSteps(kind, path, signal, tools),
});
