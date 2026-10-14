import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { clip, escapeHtml } from "./local-analyze-text.mjs";

/** Short run log. The beginner package is a separate folder. */
export const writeLocalReport = async (job) => {
  const lines = [
    "# Relatório local",
    "",
    `Alvo: ${job.target}`,
    `Tipo: ${job.detected}`,
    `Pasta: ${job.directory}`,
    "",
    "Esta execução não chamou um modelo. Ela só rodou a CLI do REA.",
    "",
  ];
  for (const step of job.steps) {
    lines.push(`## ${step.title}`, "");
    if (step.skip !== undefined) {
      lines.push(step.skip, "");
      continue;
    }
    lines.push(step.ok ? "Concluído." : "Falhou.", "");
    for (const fact of step.facts ?? []) lines.push(`- ${fact}`);
    if ((step.facts ?? []).length > 0) lines.push("");
    if (step.stderr && !step.ok)
      lines.push("```text", clip(step.stderr, 2000), "```", "");
  }
  lines.push(
    "## Evidência",
    "",
    "Os JSON completos ficam ao lado deste relatório, na pasta evidence.",
    "",
  );
  if (job.package_slug) {
    lines.push(
      `Pacote bilíngue: output/${job.package_slug}/`,
      "",
      "Comece por README.pt-BR.md ou README.en.md dentro dessa pasta.",
      "",
    );
  }
  const markdown = `${lines.join("\n")}\n`;
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8" /><title>Relatório local</title><pre>${escapeHtml(markdown)}</pre></html>\n`;
  await writeFile(join(job.directory, "report.md"), markdown);
  await writeFile(join(job.directory, "report.html"), html);
  job.report_markdown = markdown;
  job.headline = job.steps.some((step) => step.ok)
    ? "Relatório pronto."
    : "Relatório escrito. Nenhum comando de análise concluiu.";
};
