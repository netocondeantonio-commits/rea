import { countLabel, kindLabel, phrase } from "./local-analyze-copy.mjs";

const suffix = (lang) => (lang === "en" ? "en" : "pt-BR");

const linkList = (lang) =>
  [
    ["overview", "Visão do código", "Code overview"],
    ["architecture", "Mapa", "Map"],
    ["openapi", "Rotas HTTP", "HTTP routes"],
    ["findings", "O que dá para afirmar", "What can be said"],
    ["tools", "O que cada ferramenta fez", "What each tool did"],
    ["glossary", "Glossário", "Glossary"],
    ["doctor", "Ferramentas desta máquina", "Tools on this machine"],
    ["strings", "Textos encontrados", "Text that was found"],
    ["evidence", "Evidência original", "Original evidence"],
  ]
    .map(
      ([base, pt, en]) =>
        `- [${phrase(lang, pt, en)}](${base}.${suffix(lang)}.md)`,
    )
    .join("\n");

const purpose = (facts, lang) => {
  const description = facts.manifest?.description;
  if (description)
    return phrase(
      lang,
      `O package.json descreve o projeto com esta frase: “${description}”. Este texto não acrescenta outra descrição.`,
      `package.json describes the project with this sentence: “${description}”. This text does not add another description.`,
    );
  return phrase(
    lang,
    "Nenhum arquivo do alvo trouxe uma frase de descrição. Abaixo ficam só nomes, contagens e ligações que foram registradas.",
    "No file in the target supplied a description sentence. Below are only names, counts, and links that were recorded.",
  );
};

export const readmeDoc = (facts, lang) =>
  [
    `# ${phrase(lang, "Pacote para ler sem ser especialista", "A package you can read without being a specialist")}`,
    "",
    phrase(
      lang,
      "Este pacote foi montado na sua máquina a partir dos arquivos do alvo e do JSON da CLI do REA. As frases foram preenchidas por regras. Nenhum modelo de IA escreveu este texto.",
      "This package was built on your machine from the target files and the REA CLI JSON. The sentences were filled in by rules. No AI model wrote this text.",
    ),
    "",
    purpose(facts, lang),
    "",
    `## ${phrase(lang, "O que foi lido", "What was read")}`,
    "",
    `- ${phrase(lang, "Alvo informado", "Target you gave")}: ${facts.target}`,
    `- ${phrase(lang, "Caminho resolvido", "Resolved path")}: ${facts.resolved || phrase(lang, "não resolvido", "not resolved")}`,
    `- ${phrase(lang, "Tipo detectado", "Detected type")}: ${kindLabel(facts.detected, lang)}`,
    `- ${phrase(lang, "Nome usado na pasta", "Folder name")}: ${facts.slug}`,
    "",
    `## ${phrase(lang, "Ordem de leitura", "Reading order")}`,
    "",
    linkList(lang),
    "",
    phrase(
      lang,
      "O desenho também está em [architecture.svg](architecture.svg). O contrato HTTP está em [openapi.json](openapi.json).",
      "The drawing is also in [architecture.svg](architecture.svg). The HTTP contract is in [openapi.json](openapi.json).",
    ),
    "",
    phrase(
      lang,
      "Isto não é uma auditoria de segurança e não diz se o programa é seguro para usar.",
      "This is not a security audit and it does not say whether the program is safe to use.",
    ),
    "",
  ].join("\n");

const scriptLines = (facts, lang) => {
  const scripts = facts.manifest?.scripts ?? [];
  if (scripts.length === 0)
    return phrase(
      lang,
      "O alvo não declara scripts em um package.json. Esta análise não executou o programa.",
      "The target does not declare scripts in a package.json. This analysis did not run the program.",
    );
  const lines = scripts.map(
    (script) => `- \`${script.name}\`: \`${script.command}\``,
  );
  return [
    phrase(
      lang,
      "O package.json declara estes comandos. Eles não foram executados daqui. Em um checkout desse projeto, o equivalente usual é `npm run <nome>`.",
      "package.json declares these commands. They were not run from here. In a checkout of that project, the usual equivalent is `npm run <name>`.",
    ),
    "",
    ...lines,
  ].join("\n");
};

const bullet = (items, emptyPt, emptyEn, lang) => {
  if (items.length === 0) return phrase(lang, emptyPt, emptyEn);
  return items.map((item) => `- ${item}`).join("\n");
};

const MODULE_KINDS = new Set([
  "javascript-module",
  "module",
  "package",
  "electron-main",
]);

const overviewParts = (facts) => {
  const modules = [
    ...new Set(
      facts.graphs.flatMap((graph) =>
        graph.nodes
          .filter((node) => MODULE_KINDS.has(node.kind))
          .map((node) => `${node.label} (${node.kind})`),
      ),
    ),
  ];
  const entries = [];
  if (facts.manifest?.main)
    entries.push(`package.json main: ${facts.manifest.main}`);
  for (const node of facts.graphs.flatMap((graph) => graph.nodes)) {
    if (node.kind === "electron-main")
      entries.push(`${node.label} (${node.kind})`);
  }
  const functions = facts.functions.map((item) => {
    const place = item.module ? `${item.module}` : "";
    const line = item.line ? `:${item.line}` : "";
    return `${item.name} (${place}${line})`.replace(" ()", "");
  });
  return { modules, entries, functions };
};

export const overviewDoc = (facts, lang) => {
  const manifest = facts.manifest;
  const parts = overviewParts(facts);
  return [
    `# ${phrase(lang, "Visão do código", "Code overview")}`,
    "",
    purpose(facts, lang),
    "",
    `## ${phrase(lang, "Identidade", "Identity")}`,
    "",
    `- ${phrase(lang, "Nome", "Name")}: ${facts.name}`,
    `- ${phrase(lang, "Versão declarada", "Declared version")}: ${manifest?.version || phrase(lang, "não declarada", "not declared")}`,
    `- ${phrase(lang, "Tipo", "Type")}: ${kindLabel(facts.detected, lang)}`,
    facts.electron
      ? phrase(
          lang,
          "- O package.json ou o grafo cita Electron. Isso é uma declaração lida, não uma execução do aplicativo.",
          "- package.json or the graph mentions Electron. That is a declaration that was read, not a launch of the application.",
        )
      : "",
    "",
    `## ${phrase(lang, "Módulos e partes nomeadas", "Modules and named parts")}`,
    "",
    bullet(
      parts.modules,
      "Nenhum módulo foi nomeado no grafo.",
      "No module was named in the graph.",
      lang,
    ),
    "",
    `## ${phrase(lang, "Por onde diz que começa", "Where it says it starts")}`,
    "",
    bullet(
      parts.entries,
      "Nenhum ponto de entrada foi nomeado.",
      "No entry point was named.",
      lang,
    ),
    "",
    `## ${phrase(lang, "Nomes de funções vistos no código", "Function names seen in the code")}`,
    "",
    bullet(
      parts.functions,
      "O grafo semântico não listou funções.",
      "The semantic graph did not list functions.",
      lang,
    ),
    "",
    `## ${phrase(lang, "Bibliotecas declaradas", "Declared libraries")}`,
    "",
    phrase(lang, "Dependências:", "Dependencies:"),
    "",
    bullet(
      manifest?.dependencies ?? [],
      "Nenhuma dependência de produção foi declarada.",
      "No production dependency was declared.",
      lang,
    ),
    "",
    phrase(
      lang,
      "Dependências de desenvolvimento:",
      "Development dependencies:",
    ),
    "",
    bullet(
      manifest?.devDependencies ?? [],
      "Nenhuma dependência de desenvolvimento foi declarada.",
      "No development dependency was declared.",
      lang,
    ),
    "",
    `## ${phrase(lang, "Como o projeto diz para executar", "How the project says to run")}`,
    "",
    scriptLines(facts, lang),
    "",
    phrase(
      lang,
      `A varredura de texto leu ${facts.scan.filesRead} arquivo(s).${facts.scan.capped ? " Ela parou no limite de arquivos." : ""}`,
      `The text scan read ${facts.scan.filesRead} file(s).${facts.scan.capped ? " It stopped at the file cap." : ""}`,
    ),
    "",
  ].join("\n");
};

const relationLines = (facts) => {
  const counts = new Map();
  for (const graph of facts.graphs) {
    for (const edge of graph.edges) {
      const key = `${graph.name}: ${edge.relation}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([key, count]) => `${key}: ${count}`);
};

export const architectureDoc = (facts, lang) =>
  [
    `# ${phrase(lang, "Mapa", "Map")}`,
    "",
    phrase(
      lang,
      "Cada caixa é uma parte que um motor nomeou. Cada seta do texto Mermaid é uma ligação que esse motor registrou. Se uma ligação não aparece, ela não foi registrada — e isso não prova que não exista em execução.",
      "Each box is a part an engine named. Each arrow in the Mermaid text is a link that engine recorded. If a link is missing, it was not recorded — and that does not prove it does not exist at runtime.",
    ),
    "",
    "![map](architecture.svg)",
    "",
    `## ${phrase(lang, "Ligações contadas", "Counted links")}`,
    "",
    bullet(
      relationLines(facts),
      "Nenhuma ligação foi registrada.",
      "No link was recorded.",
      lang,
    ),
    "",
    phrase(
      lang,
      facts.mermaidOmitted > 0
        ? `O desenho omitiu ${facts.mermaidOmitted} parte(s) para caber na página. Os JSON em evidence/ têm a lista completa.`
        : "O desenho inclui as partes retidas desta página.",
      facts.mermaidOmitted > 0
        ? `The drawing omitted ${facts.mermaidOmitted} part(s) so the page would fit. The JSON in evidence/ has the full list.`
        : "The drawing includes the parts kept for this page.",
    ),
    "",
    `## Mermaid`,
    "",
    "```mermaid",
    facts.mermaid.trimEnd(),
    "```",
    "",
  ].join("\n");

const countLines = (facts, lang) =>
  facts.counts.map((row) => `- ${countLabel(row.key, lang)}: ${row.value}`);

const stepLines = (facts, lang) =>
  facts.steps.map((step) => {
    const state = step.skip
      ? phrase(lang, "não executado", "not run")
      : step.ok
        ? phrase(lang, "concluiu", "finished")
        : phrase(lang, "falhou", "failed");
    const note = step.skip ? ` — ${step.skip}` : "";
    const factsText = (step.facts ?? [])
      .map((fact) => `  - ${fact}`)
      .join("\n");
    return `- ${step.title} (${step.id}): ${state}${note}${factsText ? `\n${factsText}` : ""}`;
  });

export const findingsDoc = (facts, lang) => {
  const limits = facts.limitations.map((line) => `- ${line}`);
  const excerpts = facts.excerpts
    .filter((item) => item.text)
    .map(
      (item) => `### ${item.sourceName}\n\n\`\`\`text\n${item.text}\n\`\`\``,
    );
  return [
    `# ${phrase(lang, "O que dá para afirmar", "What can be said")}`,
    "",
    phrase(
      lang,
      "Os números abaixo foram copiados do JSON. Um zero significa que essa leitura não viu o fato. Não significa que o programa seja seguro, completo ou livre de rotas.",
      "The numbers below were copied from the JSON. A zero means this reading did not see the fact. It does not mean the program is safe, complete, or free of routes.",
    ),
    "",
    `## ${phrase(lang, "Avisos do motor", "Engine warnings")}`,
    "",
    limits.length > 0
      ? limits.join("\n")
      : phrase(
          lang,
          "Nenhum aviso de limitação veio no JSON.",
          "No limitation warning came in the JSON.",
        ),
    "",
    `## ${phrase(lang, "Contagens", "Counts")}`,
    "",
    countLines(facts, lang).length > 0
      ? countLines(facts, lang).join("\n")
      : phrase(
          lang,
          "Nenhuma contagem numérica foi gravada.",
          "No numeric count was recorded.",
        ),
    "",
    `## ${phrase(lang, "Campos simples do resultado", "Plain result fields")}`,
    "",
    facts.fields.length > 0
      ? facts.fields.map((field) => `- ${field.key}: ${field.value}`).join("\n")
      : phrase(
          lang,
          "Nenhum campo simples foi copiado.",
          "No plain field was copied.",
        ),
    "",
    `## ${phrase(lang, "Passos desta execução", "Steps in this run")}`,
    "",
    stepLines(facts, lang).join("\n") ||
      phrase(lang, "Nenhum passo foi registrado.", "No step was recorded."),
    "",
    excerpts.length > 0
      ? `## ${phrase(lang, "Trecho produzido pelo motor", "Excerpt produced by the engine")}\n\n${phrase(lang, "O trecho é texto do motor, cortado para caber aqui. O JSON guarda o restante.", "The excerpt is engine text, cut to fit here. The JSON keeps the rest.")}\n\n${excerpts.join("\n\n")}`
      : "",
    "",
  ].join("\n");
};
