import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

import { writeLocalPackage } from "../../../scripts/local-analyze-package.mjs";
import { safeChildPath } from "../../../scripts/local-analyze-text.mjs";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

interface PackageJob {
  id: string;
  target: string;
  resolved: string;
  detected: string;
  directory: string;
  steps: readonly {
    id: string;
    title: string;
    ok?: boolean;
    facts?: readonly string[];
  }[];
  events: unknown[];
  package_slug?: string;
  artifacts?: readonly { href?: string }[];
}

const doctor = {
  healthy: true,
  environment_healthy: true,
  checks: [{ name: "node", ok: true, detail: "v24" }],
};

const evidence = {
  subject: {
    name: "sample-notes",
    format: "directory",
    digest: { sha256: "abc" },
  },
  limitations: ["Static paths may remain unresolved."],
  normalized_result: {
    summary: { browser_windows: 0, ipc: { operations: 0 } },
    statistics: { relevant_files: 2, findings: 0 },
    graph: {
      nodes: [
        {
          node_id: "package",
          kind: "package",
          observations: [{ label: "sample-notes" }],
        },
        {
          node_id: "main",
          kind: "electron-main",
          observations: [{ label: "main.js" }],
        },
      ],
      edges: [
        {
          source_node_id: "package",
          target_node_id: "main",
          relation: "loads",
        },
      ],
    },
    semantic_graph: {
      nodes: [
        {
          kind: "function",
          label: "searchNotes",
          identity: { module_path: "main.js" },
          evidence: { location: { value: { start: { line: 3 } } } },
        },
      ],
      edges: [],
    },
  },
};

const tools = {
  commandExists: async () => false,
  runRea: async (args: readonly string[]) => {
    expect(args).toEqual(["doctor"]);
    return { ok: true, stdout: JSON.stringify(doctor), stderr: "" };
  },
};

const writeApp = async (root: string, source: string) => {
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "sample-notes",
      version: "1.0.0",
      description: "A tiny notes helper used to demonstrate local analysis.",
      main: "main.js",
      scripts: { start: "node main.js" },
      dependencies: { express: "4.21.2" },
    }),
  );
  await writeFile(join(root, "main.js"), source);
};

it("writes a bilingual package from local evidence and source text", async () => {
  const root = await createTestTempDirectory("rea-local-package-");
  const app = join(root, "app");
  await writeApp(
    app,
    [
      'const express = require("express");',
      "const app = express();",
      "function searchNotes(query) { return query; }",
      'app.get("/notes", (_req, res) => { res.send(searchNotes("hello")); });',
      "",
    ].join("\n"),
  );
  const job: PackageJob = {
    id: "job-1",
    target: app,
    resolved: app,
    detected: "javascript",
    directory: join(root, "analysis"),
    steps: [
      {
        id: "javascript",
        title: "Aplicativo JavaScript",
        ok: true,
        facts: ["nós do grafo: 2"],
      },
    ],
    events: [],
  };
  await mkdir(join(job.directory, "evidence"), { recursive: true });
  await writeFile(
    join(job.directory, "evidence", "javascript.json"),
    JSON.stringify(evidence),
  );

  await writeLocalPackage(job, tools);

  const pack = join(job.directory, "output", "app");
  const readmePt = await readFile(join(pack, "README.pt-BR.md"), "utf8");
  const readmeEn = await readFile(join(pack, "README.en.md"), "utf8");
  expect(readmePt).toContain("A tiny notes helper");
  expect(readmePt).toContain("Nenhum modelo de IA");
  expect(readmeEn).toContain("A tiny notes helper");
  expect(readmeEn).toContain("No AI model");

  const mermaid = await readFile(join(pack, "architecture.mmd"), "utf8");
  expect(mermaid).toContain("sample-notes");
  expect(mermaid).toContain("loads");
  const svg = await readFile(join(pack, "architecture.svg"), "utf8");
  expect(svg).toContain("<svg");
  expect(svg).toContain("loads");

  const openapi = JSON.parse(
    await readFile(join(pack, "openapi.json"), "utf8"),
  );
  expect(openapi.openapi).toBe("3.0.3");
  expect(openapi.paths["/notes"]?.get?.summary).toContain("main.js");

  const overview = await readFile(join(pack, "overview.en.md"), "utf8");
  expect(overview).toContain("searchNotes");
  expect(overview).toContain("express@4.21.2");
  expect(overview).toContain("node main.js");
  expect(overview).toContain("Electron");

  const toolsPt = await readFile(join(pack, "tools.pt-BR.md"), "utf8");
  const toolsEn = await readFile(join(pack, "tools.en.md"), "utf8");
  expect(toolsPt).toContain("não inicia o alvo");
  expect(toolsEn).toContain("does not start the target");
  expect(toolsPt).toContain("GhidraMCP");

  expect(await readFile(join(pack, "glossary.pt-BR.md"), "utf8")).toContain(
    "Análise estática",
  );
  expect(await readFile(join(pack, "glossary.en.md"), "utf8")).toContain(
    "Static analysis",
  );
  const findings = await readFile(join(pack, "findings.en.md"), "utf8");
  expect(findings).toContain("Static paths may remain unresolved.");
  expect(findings).toContain("does not mean the program is safe");
  const savedDoctor = JSON.parse(
    await readFile(join(pack, "doctor.json"), "utf8"),
  );
  expect(savedDoctor.healthy).toBe(true);
  const index = await readFile(join(pack, "index.html"), "utf8");
  expect(index).toContain('lang="pt-BR"');
  expect(index).toContain('lang="en"');
  expect(index).toContain("README.pt-BR.html");
  expect(index).toContain("README.en.html");
  await readFile(join(pack, "evidence", "javascript.json"));
  expect(job.package_slug).toBe("app");
  expect(
    job.artifacts?.some((item) => item.href === "/packages/job-1/openapi.json"),
  ).toBe(true);
});

it("writes an empty OpenAPI contract when no route text is found", async () => {
  const root = await createTestTempDirectory("rea-local-empty-");
  const app = join(root, "plain");
  await writeApp(app, "function searchNotes(query) { return query; }\n");
  const job: PackageJob = {
    id: "job-2",
    target: app,
    resolved: app,
    detected: "javascript",
    directory: join(root, "analysis"),
    steps: [],
    events: [],
  };
  await mkdir(job.directory, { recursive: true });
  await writeLocalPackage(job, tools);
  const openapi = JSON.parse(
    await readFile(
      join(job.directory, "output", "plain", "openapi.json"),
      "utf8",
    ),
  );
  expect(openapi.paths).toEqual({});
  expect(openapi.info.title).toBe("No HTTP API was discovered");
  const note = await readFile(
    join(job.directory, "output", "plain", "openapi.pt-BR.md"),
    "utf8",
  );
  expect(note).toContain("Nenhuma rota HTTP");
});

it("rejects package paths that leave the output directory", () => {
  const root = "/tmp/rea-package-root";
  expect(safeChildPath(root, "README.en.md")).toBe(`${root}/README.en.md`);
  expect(safeChildPath(root, "evidence/javascript.json")).toBe(
    `${root}/evidence/javascript.json`,
  );
  expect(safeChildPath(root, "../job.json")).toBeUndefined();
  expect(safeChildPath(root, "%2e%2e/job.json")).toBeUndefined();
  expect(safeChildPath(root, "README.en.md%00.svg")).toBeUndefined();
});
