import type {
  ApprovalSummary,
  ExperimentPrioritization,
  FunnelAnalysis,
  GrowthDiagnosis,
  GrowthMetricsBundle,
  GrowthWorkerRequest,
} from "./types.js";
import { formatPercent } from "./growth.js";

export function renderGrowthBriefMarkdown(input: {
  readonly request: GrowthWorkerRequest;
  readonly metrics: GrowthMetricsBundle;
  readonly funnelAnalysis: FunnelAnalysis;
  readonly diagnosis: GrowthDiagnosis;
  readonly prioritization: ExperimentPrioritization;
  readonly approvalSummary: ApprovalSummary;
}): string {
  const objective = input.request.objective ?? "overall-growth";
  const lines: string[] = [
    "# Growth Analysis & Experiment Brief",
    "",
    "## Business Objective",
    `- Business: ${input.request.businessId}`,
    `- Stated objective: ${objective}`,
    ...(input.request.context === undefined ? [] : [`- Context: ${input.request.context}`]),
    "",
    "## Executive Summary",
    input.funnelAnalysis.summary,
    "",
    "Top prioritized experiments:",
  ];

  for (const experiment of input.prioritization.experiments.slice(0, 3)) {
    lines.push(`- **${experiment.title}** (rank ${experiment.priorityRank}, score ${experiment.priorityScore})`);
  }

  lines.push("", "## Funnel Snapshot", "");
  lines.push("| Stage | Count | Rate |");
  lines.push("| --- | ---: | --- |");
  const { funnel } = input.metrics;
  lines.push(`| Sessions | ${funnel.sessions.toLocaleString()} | — |`);
  lines.push(
    `| Product views | ${funnel.productViews.toLocaleString()} | ${formatPercent(input.funnelAnalysis.rates.sessionToProductViewRate)} of sessions |`,
  );
  lines.push(
    `| Add to cart | ${funnel.addToCart.toLocaleString()} | ${formatPercent(input.funnelAnalysis.rates.productViewToCartRate)} of views |`,
  );
  lines.push(
    `| Checkout started | ${funnel.checkoutStarted.toLocaleString()} | ${formatPercent(input.funnelAnalysis.rates.cartToCheckoutRate)} of carts |`,
  );
  lines.push(
    `| Purchases | ${funnel.purchases.toLocaleString()} | ${formatPercent(input.funnelAnalysis.rates.checkoutToPurchaseRate)} of checkouts |`,
  );

  lines.push("", "## Key Findings", "");
  if (input.diagnosis.findings.length === 0) {
    lines.push("- No rule-based issues exceeded demo thresholds.");
  } else {
    for (const finding of input.diagnosis.findings) {
      lines.push(`### ${finding.id}`);
      lines.push(`- Area: ${finding.area}; Severity: ${finding.severity}`);
      lines.push(`- ${finding.finding}`);
      lines.push(`- Evidence: ${finding.evidence}`);
      lines.push("");
    }
  }

  lines.push("## Growth Opportunities", "");
  for (const opportunity of input.diagnosis.opportunities) {
    lines.push(`### ${opportunity.id}`);
    lines.push(`- Problem: ${opportunity.problem}`);
    lines.push(`- Hypothesis: ${opportunity.hypothesis}`);
    lines.push(`- Expected outcome: ${opportunity.expectedOutcome}`);
    lines.push(`- Supporting findings: ${opportunity.supportingFindingIds.join(", ")}`);
    lines.push("");
  }

  lines.push("## Prioritized Experiments", "");
  lines.push(`Prioritization method: ${input.prioritization.method}`, "");

  for (const experiment of input.prioritization.experiments) {
    lines.push(`### Experiment ${experiment.priorityRank}: ${experiment.title} (\`${experiment.id}\`)`);
    lines.push(`Problem: ${describeExperimentProblem(experiment.supportingOpportunityIds, input.diagnosis)}`);
    lines.push(`Hypothesis: ${experiment.hypothesis}`);
    lines.push(`Target metric: ${experiment.targetMetric} (${experiment.expectedDirection})`);
    lines.push(`Impact: ${experiment.impact}; Confidence: ${experiment.confidence}; Effort: ${experiment.effort}`);
    lines.push(`Score: ${experiment.priorityScore} — ${experiment.rationale}`);
    lines.push("");
  }

  lines.push(
    "## Recommended Measurement Plan",
    "- Track primary funnel rates weekly using the same definitions as this brief.",
    "- Run one experiment at a time on the highest-traffic funnel step when possible.",
    "- Compare variant performance for at least one full business cycle before scaling.",
    "",
    "## Risks / Caveats",
    "- All metrics are synthetic fixtures; do not treat thresholds as industry benchmarks.",
    "- Rule-based diagnosis does not replace causal experimentation or incrementality testing.",
    "- Paid and organic effects are not decomposed in this demo dataset.",
    "",
    "## Next Actions",
    ...input.approvalSummary.topExperiments.map((item) => `- Execute: ${item}`),
    "- Instrument experiment exposure and conversion events before launch.",
    "",
  );

  return lines.join("\n");
}

function describeExperimentProblem(opportunityIds: readonly string[], diagnosis: GrowthDiagnosis): string {
  const problems = opportunityIds
    .map((id) => diagnosis.opportunities.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .map((item) => item.problem);
  return problems.length > 0 ? problems.join(" ") : "See linked opportunities.";
}
