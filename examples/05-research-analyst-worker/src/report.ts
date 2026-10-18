import type {
  EvidenceRecord,
  EvidenceReview,
  ResearchAnalysis,
  ResearchPlan,
  ResearchSource,
  ResearchWorkerRequest,
} from "./types.js";

export function renderResearchReportMarkdown(options: {
  readonly request: ResearchWorkerRequest;
  readonly plan: ResearchPlan;
  readonly sources: readonly ResearchSource[];
  readonly evidence: readonly EvidenceRecord[];
  readonly analysis: ResearchAnalysis;
  readonly review: EvidenceReview;
}): string {
  const { request, plan, sources, evidence, analysis, review } = options;
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const conflicts = review.issues.filter((issue) => issue.type === "conflict");
  const gaps = review.issues.filter((issue) => issue.type === "coverage-gap");
  const agreementThemes = analysis.themes.filter((theme) => theme.confidence !== "low");

  const lines: string[] = [
    "# Research Report",
    "",
    "## Research Question",
    request.question,
    "",
    "## Objective",
    request.objective ?? "(none provided)",
    "",
    "## Executive Summary",
    buildExecutiveSummary(analysis, review),
    "",
    "## Research Approach",
    "Deterministic multi-stage OSVA workflow: plan → fixture source collection (MCP) → evidence extraction → " +
      "theme synthesis → evidence review → human approval → Markdown artifact.",
    "",
    "### Sub-questions",
    ...plan.subQuestions.map((item) => `- ${item}`),
    "",
    "## Key Findings",
  ];

  analysis.themes.forEach((theme, index) => {
    lines.push(`### Finding ${index + 1}: ${theme.name}`);
    lines.push(theme.finding);
    lines.push("");
    lines.push("Evidence:");
    for (const evidenceId of theme.supportingEvidenceIds) {
      const record = evidence.find((item) => item.id === evidenceId);
      if (record === undefined) continue;
      const source = sourceById.get(record.sourceId);
      lines.push(`- ${evidenceId} — ${source?.title ?? record.sourceId}: ${record.claim}`);
    }
    lines.push("");
    lines.push(`Confidence: ${theme.confidence}`);
    if (theme.caveats.length > 0) {
      lines.push("Caveats:");
      for (const caveat of theme.caveats) {
        lines.push(`- ${caveat}`);
      }
    }
    lines.push("");
  });

  lines.push("## Areas of Agreement");
  if (agreementThemes.length === 0) {
    lines.push("- No themes reached medium/high confidence in the fixture run.");
  } else {
    for (const theme of agreementThemes) {
      lines.push(`- ${theme.name}: ${theme.finding}`);
    }
  }
  lines.push("", "## Conflicting Evidence");
  if (conflicts.length === 0) {
    lines.push("- No explicit conflicts detected.");
  } else {
    for (const issue of conflicts) {
      lines.push(`- ${issue.description}`);
    }
  }
  lines.push("", "## Evidence Gaps");
  if (gaps.length === 0) {
    lines.push("- No coverage gaps flagged relative to the research plan.");
  } else {
    for (const issue of gaps) {
      lines.push(`- ${issue.description}`);
    }
  }
  lines.push("", "## Implications");
  lines.push(
    "- Mid-market SaaS adoption appears driven by cost and scale pressures, with expected tier-1 deflection benefits.",
  );
  lines.push(
    "- Implementation timelines remain contested; treat vendor speed claims as low-confidence without corroboration.",
  );
  lines.push("", "## Recommended Follow-up Research");
  lines.push("- Replace fixture source collection with live web search or internal document connectors.");
  lines.push("- Add customer interviews and product usage metrics before strategic commitments.");
  lines.push("", "## Sources");
  for (const source of sources) {
    const urlSuffix = source.url === undefined ? "" : ` (${source.url})`;
    lines.push(`- ${source.id}: ${source.title} — ${source.publisher}${urlSuffix}`);
  }
  lines.push("");
  return lines.join("\n");
}

function buildExecutiveSummary(analysis: ResearchAnalysis, review: EvidenceReview): string {
  const high = analysis.themes.filter((theme) => theme.confidence === "high").length;
  const conflictCount = review.issues.filter((issue) => issue.type === "conflict").length;
  return (
    `Fixture-backed research synthesized ${analysis.themes.length} theme(s) ` +
    `(${high} high-confidence). Evidence review recorded ${review.issues.length} issue(s), ` +
    `including ${conflictCount} explicit conflict(s). Conflicting records are preserved below.`
  );
}
