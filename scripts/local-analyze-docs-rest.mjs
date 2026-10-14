import { GLOSSARY, phrase } from "./local-analyze-copy.mjs";

const stepOf = (facts, id) => facts.steps.find((step) => step.id === id);

const stepSentence = (step, lang, absent) => {
  if (!step) return absent;
  if (step.skip)
    return phrase(
      lang,
      `Não executou. Nota registrada: ${step.skip}`,
      `Did not run. Recorded note: ${step.skip}`,
    );
  if (step.ok)
    return phrase(
      lang,
      "Concluiu. O JSON desse passo está na pasta evidence.",
      "Finished. That step's JSON is in the evidence folder.",
    );
  return phrase(
    lang,
    "Foi chamado e falhou. O motivo fica no JSON desse passo.",
    "It was called and failed. The reason is in that step's JSON.",
  );
};

const yesNo = (flag, lang) =>
  phrase(
    lang,
    flag ? "encontrado" : "não encontrado",
    flag ? "found" : "not found",
  );

const engineBlocks = (facts, lang) => {
  const java = stepOf(facts, "javascript");
  const android = stepOf(facts, "android") ?? stepOf(facts, "android-missing");
  const ghidra = stepOf(facts, "ghidra") ?? stepOf(facts, "ghidra-missing");
  const rizin = stepOf(facts, "rizin") ?? stepOf(facts, "rizin-strings");
  return [
    [
      "REA",
      phrase(
        lang,
        "A CLI local leu o alvo e gravou JSON. Este pacote só organiza essa saída. Nenhum modelo foi chamado. O MCP continua opcional e não é necessário aqui.",
        "The local CLI read the target and wrote JSON. This package only organizes that output. No model was called. MCP stays optional and is not required here.",
      ),
    ],
    [
      "JavaScript",
      stepSentence(
        java,
        lang,
        phrase(
          lang,
          "Não houve passo de JavaScript. O alvo não foi classificado como pasta ou aplicativo JavaScript.",
          "There was no JavaScript step. The target was not classified as a JavaScript folder or application.",
        ),
      ),
    ],
    [
      "JADX",
      stepSentence(
        android,
        lang,
        phrase(
          lang,
          `Não houve passo de APK. JADX (REA_JADX_MCP_JAR) está ${yesNo(facts.companions.jadx, lang)}.`,
          `There was no APK step. JADX (REA_JADX_MCP_JAR) is ${yesNo(facts.companions.jadx, lang)}.`,
        ),
      ),
    ],
    [
      "Ghidra",
      stepSentence(
        ghidra,
        lang,
        phrase(
          lang,
          `Este alvo não pediu descompilação nativa. GHIDRA_INSTALL_DIR está ${yesNo(facts.companions.ghidra, lang)}.`,
          `This target did not ask for native decompilation. GHIDRA_INSTALL_DIR is ${yesNo(facts.companions.ghidra, lang)}.`,
        ),
      ),
    ],
    [
      "objdump",
      stepSentence(
        stepOf(facts, "objdump"),
        lang,
        phrase(
          lang,
          `Não houve passo de cabeçalhos nativos. objdump está ${yesNo(facts.companions.objdump, lang)}.`,
          `There was no native-header step. objdump is ${yesNo(facts.companions.objdump, lang)}.`,
        ),
      ),
    ],
    [
      "Rizin",
      stepSentence(
        rizin,
        lang,
        phrase(
          lang,
          `Não houve passo do Rizin. O programa está ${yesNo(facts.companions.rizin, lang)}.`,
          `There was no Rizin step. The program is ${yesNo(facts.companions.rizin, lang)}.`,
        ),
      ),
    ],
  ];
};

const companionBlocks = (facts, lang) => [
  [
    "Frida",
    phrase(
      lang,
      `O Frida observa um processo em execução. Este caminho não inicia o alvo e não se anexa a nada. Frida no PATH: ${yesNo(facts.companions.frida, lang)}.`,
      `Frida watches a running process. This path does not start the target and does not attach to anything. Frida on PATH: ${yesNo(facts.companions.frida, lang)}.`,
    ),
  ],
  [
    "GhidraMCP",
    phrase(
      lang,
      `O GhidraMCP é uma ponte separada para o Ghidra. Este comando não sobe esse servidor. Se o Ghidra rodou, foi pelo provedor do REA. ghidra-mcp: ${yesNo(facts.companions.ghidraMcp, lang)}.`,
      `GhidraMCP is a separate bridge to Ghidra. This command does not start that server. If Ghidra ran, it was through REA's provider. ghidra-mcp: ${yesNo(facts.companions.ghidraMcp, lang)}.`,
    ),
  ],
  [
    "GDB",
    phrase(
      lang,
      `O GDB depura um processo ao vivo. Este caminho não depura. GDB: ${yesNo(facts.companions.gdb, lang)}.`,
      `GDB debugs a live process. This path does not debug. GDB: ${yesNo(facts.companions.gdb, lang)}.`,
    ),
  ],
  [
    "doctor",
    phrase(
      lang,
      "O doctor só responde se as ferramentas desta máquina estão prontas. O resumo está em doctor.pt-BR.md e o JSON em doctor.json.",
      "Doctor only says whether the tools on this machine are ready. The summary is in doctor.en.md and the JSON is in doctor.json.",
    ),
  ],
];

export const toolsDoc = (facts, lang) => {
  const blocks = [
    ...engineBlocks(facts, lang),
    ...companionBlocks(facts, lang),
  ];
  return [
    `# ${phrase(lang, "O que cada ferramenta fez", "What each tool did")}`,
    "",
    ...blocks.flatMap(([title, body]) => [`## ${title}`, "", body, ""]),
  ].join("\n");
};

export const glossaryDoc = (lang) =>
  [
    `# ${phrase(lang, "Glossário", "Glossary")}`,
    "",
    phrase(
      lang,
      "Palavras usadas neste pacote, no sentido em que estes arquivos as usam.",
      "Words used in this package, in the sense these files use them.",
    ),
    "",
    ...GLOSSARY.flatMap(([term, pt, en]) => [
      `## ${term}`,
      "",
      phrase(lang, pt, en),
      "",
    ]),
  ].join("\n");

const routeLines = (routes) =>
  routes.map((route) => {
    const where = route.line ? `${route.file}:${route.line}` : route.file;
    return `- ${route.method} ${route.path} (${route.origin}, ${where})`;
  });

export const openApiDoc = (facts, lang) => {
  const discovered = Object.keys(facts.openApi.paths).length > 0;
  return [
    `# ${phrase(lang, "Rotas HTTP", "HTTP routes")}`,
    "",
    discovered
      ? phrase(
          lang,
          "Cada rota abaixo foi copiada de um texto do alvo ou de um campo do JSON. Nenhuma requisição foi enviada. Uma rota escrita num arquivo pode não existir quando o programa roda.",
          "Each route below was copied from target text or from a JSON field. No request was sent. A route written in a file may not exist when the program runs.",
        )
      : phrase(
          lang,
          "Nenhuma rota HTTP foi encontrada nos arquivos lidos nem nos JSON dos motores. O arquivo openapi.json existe mesmo assim: é um contrato vazio que documenta essa ausência. Ausência nesta leitura não prova que o programa não tenha uma API.",
          "No HTTP route was found in the files that were read or in the engine JSON. openapi.json still exists: it is an empty contract that documents that absence. Absence in this reading does not prove the program has no API.",
        ),
    "",
    routeLines(facts.http).join("\n"),
    "",
    `## ${phrase(lang, "Endereços literais", "Literal addresses")}`,
    "",
    facts.urls.length > 0
      ? facts.urls
          .map((item) => `- ${item.url} (${item.file}:${item.line})`)
          .join("\n")
      : phrase(
          lang,
          "Nenhum endereço http(s) literal foi copiado.",
          "No literal http(s) address was copied.",
        ),
    "",
    phrase(
      lang,
      "Abra [openapi.json](openapi.json) em um leitor OpenAPI ou no Swagger Editor. Ele descreve só o que esta página listou.",
      "Open [openapi.json](openapi.json) in an OpenAPI reader or in Swagger Editor. It describes only what this page listed.",
    ),
    "",
  ].join("\n");
};

export const doctorDoc = (facts, lang) => {
  const doctor = facts.doctor;
  const checks = doctor.checks.map((check) => {
    const state = check.ok
      ? phrase(lang, "pronto", "ready")
      : phrase(lang, "não pronto", "not ready");
    const detail = check.detail ? ` — ${check.detail}` : "";
    const fix = check.remediation
      ? phrase(
          lang,
          `. O que o doctor sugere: ${check.remediation}`,
          `. Doctor suggests: ${check.remediation}`,
        )
      : "";
    return `- ${check.name}: ${state}${detail}${fix}`;
  });
  return [
    `# ${phrase(lang, "Ferramentas desta máquina", "Tools on this machine")}`,
    "",
    phrase(
      lang,
      "Isto não descreve o alvo. Descreve se a instalação local do REA e dos motores respondeu à checagem.",
      "This does not describe the target. It describes whether the local REA install and the engines answered the check.",
    ),
    "",
    `- healthy: ${String(doctor.healthy)}`,
    `- environment_healthy: ${String(doctor.environmentHealthy)}`,
    doctor.error ? `- ${phrase(lang, "erro", "error")}: ${doctor.error}` : "",
    "",
    checks.join("\n") ||
      phrase(lang, "Nenhum check veio no JSON.", "No check came in the JSON."),
    "",
    phrase(
      lang,
      "O JSON integral está em [doctor.json](doctor.json).",
      "The full JSON is in [doctor.json](doctor.json).",
    ),
    "",
  ].join("\n");
};

export const stringsDoc = (facts, lang) => {
  const preview = facts.strings.slice(0, 40).map((item) => {
    if (typeof item === "string") return `- ${item}`;
    const where = item.line ? `${item.file}:${item.line}` : item.file;
    return `- ${item.value} (${where})`;
  });
  return [
    `# ${phrase(lang, "Textos encontrados", "Text that was found")}`,
    "",
    phrase(
      lang,
      "Uma string é um trecho de texto dentro do arquivo. Ela não diz, sozinha, o que o programa faz com esse texto. Esta lista não classifica segredos.",
      "A string is a piece of text inside the file. On its own it does not say what the program does with that text. This list does not classify secrets.",
    ),
    "",
    preview.join("\n") ||
      phrase(lang, "Nenhum trecho foi retido.", "No piece of text was kept."),
    "",
    facts.rizinExcerpt
      ? `## Rizin\n\n\`\`\`text\n${facts.rizinExcerpt}\n\`\`\``
      : "",
    "",
    phrase(
      lang,
      "A lista crua está em [strings.txt](strings.txt).",
      "The raw list is in [strings.txt](strings.txt).",
    ),
    "",
  ].join("\n");
};

export const evidenceDoc = (facts, lang) =>
  [
    `# ${phrase(lang, "Evidência original", "Original evidence")}`,
    "",
    phrase(
      lang,
      "Estes arquivos são a saída da CLI, copiados para cá. O texto das outras páginas não substitui o JSON.",
      "These files are the CLI output, copied here. The text on the other pages does not replace the JSON.",
    ),
    "",
    facts.evidenceFiles.length > 0
      ? facts.evidenceFiles
          .map(
            (file) =>
              `- [${file.name}](evidence/${file.name}) — ${file.bytes} bytes`,
          )
          .join("\n")
      : phrase(
          lang,
          "Nenhum JSON de evidência foi gravado.",
          "No evidence JSON was written.",
        ),
    "",
  ].join("\n");
