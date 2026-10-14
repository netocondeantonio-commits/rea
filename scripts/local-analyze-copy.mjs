/** Fixed bilingual sentences. Runtime text is filled from evidence, not from a model. */

export const phrase = (lang, pt, en) => (lang === "en" ? en : pt);

export const KIND_LABEL = {
  javascript: [
    "aplicativo ou pasta JavaScript",
    "JavaScript application or folder",
  ],
  android: ["pacote Android", "Android package"],
  website: ["pasta com index.html", "folder with index.html"],
  pe: ["arquivo PE (Windows)", "PE file (Windows)"],
  native: ["binário nativo", "native binary"],
  dotnet: ["assembly .NET", ".NET assembly"],
  github: ["repositório GitHub", "GitHub repository"],
  url: ["URL recusada", "refused URL"],
  ausente: ["caminho ausente", "missing path"],
  unknown: ["tipo não reconhecido", "unrecognized type"],
};

export const kindLabel = (kind, lang) => {
  const pair = KIND_LABEL[kind] ?? KIND_LABEL.unknown;
  return phrase(lang, pair[0], pair[1]);
};

export const GLOSSARY = [
  [
    "Evidência / Evidence",
    "O JSON que o REA gravou. É o registro do motor, separado deste texto explicativo.",
    "The JSON REA wrote. It is the engine record, separate from this explanation.",
  ],
  [
    "Grafo / Graph",
    "Pontos e setas. Cada ponto é uma parte que o motor nomeou. Cada seta é uma ligação que o motor registrou.",
    "Dots and arrows. Each dot is a part the engine named. Each arrow is a link the engine recorded.",
  ],
  [
    "Análise estática / Static analysis",
    "Leitura do arquivo sem executar o programa.",
    "Reading the file without running the program.",
  ],
  [
    "Descompilador / Decompiler",
    "Programa que tenta reescrever um binário em texto parecido com código. O texto pode estar incompleto.",
    "A program that tries to rewrite a binary as text that looks like code. The text can be incomplete.",
  ],
  [
    "Ponto de entrada / Entry point",
    "O arquivo ou função por onde o projeto diz que começa.",
    "The file or function the project says it starts from.",
  ],
  [
    "Rota HTTP / HTTP route",
    "Um endereço que um servidor poderia responder, como /notes. Aqui ela só foi vista escrita num arquivo.",
    "An address a server might answer, such as /notes. Here it was only seen written in a file.",
  ],
  [
    "OpenAPI",
    "Um formato padrão para listar rotas HTTP. O arquivo openapi.json segue esse formato.",
    "A standard format for listing HTTP routes. The openapi.json file follows that format.",
  ],
  [
    "Limitação / Limitation",
    "Um aviso do motor sobre o que esta leitura não consegue provar.",
    "An engine warning about what this reading cannot prove.",
  ],
  [
    "String",
    "Um trecho de texto encontrado no arquivo. Não é, por si só, um segredo nem uma conclusão.",
    "A piece of text found in the file. On its own it is not a secret and not a conclusion.",
  ],
  [
    "Doctor",
    "A checagem de quais ferramentas estão prontas nesta máquina. Não analisa o alvo.",
    "The check of which tools are ready on this machine. It does not analyze the target.",
  ],
  [
    "SHA-256",
    "Uma impressão digital do arquivo. Serve para reconhecer o mesmo conteúdo depois.",
    "A fingerprint of the file. It lets you recognize the same content later.",
  ],
  [
    "Electron",
    "Uma forma de empacotar um aplicativo JavaScript como programa de desktop. Só afirmamos isso quando o package.json ou o grafo dizem.",
    "A way to package a JavaScript application as a desktop program. We say so only when package.json or the graph says so.",
  ],
];

export const COUNT_LABEL = {
  "statistics.relevant_files": ["arquivos considerados", "files considered"],
  "statistics.parsed_javascript_files": [
    "arquivos JavaScript lidos",
    "JavaScript files parsed",
  ],
  "statistics.modules": ["módulos contados", "modules counted"],
  "statistics.findings": [
    "achados contados pelo motor",
    "findings counted by the engine",
  ],
  "statistics.parse_failures": ["falhas ao ler código", "code parse failures"],
  "summary.browser_windows": [
    "janelas de navegador declaradas",
    "declared browser windows",
  ],
  "summary.preload_entrypoints": ["pontos de preload", "preload entry points"],
  "summary.context_bridge_apis": [
    "APIs de ponte de contexto",
    "context-bridge APIs",
  ],
  "summary.native_addon_bindings": [
    "ligações com código nativo",
    "native-addon bindings",
  ],
  "summary.ipc.operations": [
    "operações de mensagem interna (IPC)",
    "internal message operations (IPC)",
  ],
};

export const countLabel = (key, lang) => {
  const pair = COUNT_LABEL[key];
  return pair ? phrase(lang, pair[0], pair[1]) : key;
};

const CARD_SPECS = [
  {
    file: "index.html",
    lang: "both",
    title_pt: "Pacote completo",
    title_en: "Full package",
    blurb_pt:
      "A página junta os dois idiomas e aponta para cada arquivo gerado.",
    blurb_en:
      "This page puts both languages together and points at each generated file.",
  },
  {
    base: "README",
    title_pt: "Comece por aqui",
    title_en: "Start here",
    blurb_pt:
      "Explica o que foi lido, o que não foi afirmado e em que ordem ler o resto.",
    blurb_en:
      "Explains what was read, what was not claimed, and the order to read the rest.",
  },
  {
    base: "overview",
    title_pt: "Visão do código",
    title_en: "Code overview",
    blurb_pt:
      "Módulos, por onde o projeto diz que começa, bibliotecas declaradas e comandos de execução escritos pelo próprio projeto.",
    blurb_en:
      "Modules, where the project says it starts, declared libraries, and run commands written by the project itself.",
  },
  {
    base: "architecture",
    title_pt: "Mapa",
    title_en: "Map",
    blurb_pt:
      "Desenho das partes e das ligações que os motores registraram. Não é um organograma inventado.",
    blurb_en:
      "Drawing of the parts and links the engines recorded. It is not an invented org chart.",
  },
  {
    file: "architecture.svg",
    lang: "both",
    title_pt: "Desenho do mapa",
    title_en: "Map drawing",
    blurb_pt:
      "A mesma lista de partes, em uma imagem que abre sem outra ferramenta.",
    blurb_en:
      "The same list of parts, as an image that opens without another tool.",
  },
  {
    base: "openapi",
    title_pt: "Rotas HTTP",
    title_en: "HTTP routes",
    blurb_pt:
      "Se aparecer um endereço, ele foi copiado de um arquivo ou do JSON. Se não aparecer, o arquivo OpenAPI explica que nenhum foi achado. Nenhuma chamada de rede foi feita.",
    blurb_en:
      "If an address appears, it was copied from a file or from JSON. If none appears, the OpenAPI file says so. No network call was made.",
  },
  {
    file: "openapi.json",
    lang: "both",
    title_pt: "Arquivo OpenAPI",
    title_en: "OpenAPI file",
    blurb_pt:
      "O contrato em JSON. Pode ser aberto no Swagger Editor. Com zero rotas, ele ainda é um contrato válido e diz que nada foi descoberto.",
    blurb_en:
      "The contract in JSON. It can be opened in Swagger Editor. With zero routes it is still a valid contract and says nothing was discovered.",
  },
  {
    base: "findings",
    title_pt: "O que dá para afirmar",
    title_en: "What can be said",
    blurb_pt:
      "Limites desta leitura e números que os motores gravaram. Não é um certificado de segurança.",
    blurb_en:
      "Limits of this reading and numbers the engines recorded. It is not a security certificate.",
  },
  {
    base: "tools",
    title_pt: "O que cada ferramenta fez",
    title_en: "What each tool did",
    blurb_pt:
      "Ghidra, JADX, Rizin, Frida, GhidraMCP e as outras: se rodou, se faltou, ou se este caminho não a executa.",
    blurb_en:
      "Ghidra, JADX, Rizin, Frida, GhidraMCP, and the others: whether it ran, was missing, or is not executed on this path.",
  },
  {
    base: "glossary",
    title_pt: "Glossário",
    title_en: "Glossary",
    blurb_pt: "As palavras usadas nestes arquivos, em frase curta.",
    blurb_en: "The words used in these files, in a short sentence.",
  },
  {
    base: "doctor",
    title_pt: "Ferramentas desta máquina",
    title_en: "Tools on this machine",
    blurb_pt:
      "O doctor diz se cada ferramenta está pronta. Isso não descreve o alvo.",
    blurb_en:
      "Doctor says whether each tool is ready. That does not describe the target.",
  },
  {
    file: "doctor.json",
    lang: "both",
    title_pt: "JSON do doctor",
    title_en: "Doctor JSON",
    blurb_pt: "A resposta original do comando doctor, sem resumo.",
    blurb_en: "The original doctor command response, without a summary.",
  },
  {
    base: "strings",
    title_pt: "Textos encontrados",
    title_en: "Text that was found",
    blurb_pt:
      "Trechos de texto vistos no código ou listados pelo programa strings / Rizin.",
    blurb_en:
      "Pieces of text seen in the code or listed by the strings program / Rizin.",
  },
  {
    file: "strings.txt",
    lang: "both",
    title_pt: "Lista de textos",
    title_en: "Text list",
    blurb_pt: "A lista crua, uma linha por trecho.",
    blurb_en: "The raw list, one piece per line.",
  },
  {
    base: "evidence",
    title_pt: "Evidência original",
    title_en: "Original evidence",
    blurb_pt: "Os JSON que a CLI gravou, com o nome do passo que os produziu.",
    blurb_en:
      "The JSON the CLI wrote, with the name of the step that produced it.",
  },
];

const proseCards = (jobId, spec) =>
  ["pt-BR", "en"].map((lang) => ({
    file: `${spec.base}.${lang}.html`,
    lang,
    title_pt: spec.title_pt,
    title_en: spec.title_en,
    blurb_pt: spec.blurb_pt,
    blurb_en: spec.blurb_en,
    href: `/packages/${jobId}/${spec.base}.${lang}.html`,
    markdown_href: `/packages/${jobId}/${spec.base}.${lang}.md`,
  }));

/** Cards the dashboard shows. `jobId` is only used to build loopback links. */
export const packageArtifacts = (jobId) =>
  CARD_SPECS.flatMap((spec) =>
    spec.base
      ? proseCards(jobId, spec)
      : [{ ...spec, href: `/packages/${jobId}/${spec.file}` }],
  );
