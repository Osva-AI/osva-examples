import type { ResearchSynthesis } from "./synthesis.js";
import type { ResearchRequest } from "./input.js";

export function renderParallelResearchMarkdown(request: ResearchRequest, synthesis: ResearchSynthesis): string {
  const lines: string[] = [
    "# Parallel Research Report",
    "",
    `**Question:** ${request.question}`,
    "",
    "## Branch summaries",
  ];

  for (const section of synthesis.sections) {
    lines.push("", `### ${section.branch} — ${section.headline}`, "");
    for (const bullet of section.bullets) {
      lines.push(`- ${bullet}`);
    }
    lines.push("", `Sources: ${section.sourceIds.join(", ")}`);
  }

  lines.push("", "## Cross-cutting themes", "");
  for (const theme of synthesis.crossCuttingThemes) {
    lines.push(`- ${theme}`);
  }

  lines.push("", "## Traceability", "", "Each bullet maps to a branch-specific fixture source id listed above.");
  return `${lines.join("\n")}\n`;
}
