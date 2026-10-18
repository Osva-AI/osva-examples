import type {
  ApprovalSummary,
  AttentionPrioritization,
  CompanyDataBundle,
  FoundersOfficeRequest,
  NormalizedSignal,
  RecommendedAction,
} from "./types.js";

export function renderExecutiveBriefMarkdown(input: {
  readonly request: FoundersOfficeRequest;
  readonly data: CompanyDataBundle;
  readonly signals: readonly NormalizedSignal[];
  readonly prioritization: AttentionPrioritization;
  readonly actions: readonly RecommendedAction[];
  readonly approvalSummary: ApprovalSummary;
}): string {
  const topItems = input.prioritization.items.slice(0, 5);
  const risks = input.prioritization.items.filter((item) => item.type === "risk");
  const opportunities = input.prioritization.items.filter((item) => item.type === "opportunity");
  const decisions = input.prioritization.items.filter((item) => item.type === "decision");
  const watchlist = input.signals.filter((signal) => signal.urgency === "low" && signal.impact !== "high");

  const lines: string[] = [
    "# Founder's Office Brief",
    "",
    "## Executive Summary",
    `Company: ${input.request.companyId}`,
    ...(input.request.objective === undefined ? [] : [`Objective: ${input.request.objective}`]),
    ...(input.request.context === undefined ? [] : [`Context: ${input.request.context}`]),
    "",
    "Top attention items this cycle:",
  ];

  for (const item of topItems) {
    lines.push(`- **${item.priority.toUpperCase()}** ${item.title} (${item.type})`);
  }

  lines.push("", "## Critical Risks", "");
  appendAttentionSection(
    lines,
    risks.filter((item) => item.priority === "critical" || item.priority === "high"),
  );

  lines.push("", "## Top Opportunities", "");
  appendAttentionSection(lines, opportunities.slice(0, 4));

  lines.push("", "## Decisions Needed", "");
  appendAttentionSection(lines, decisions);

  lines.push("", "## KPI Snapshot", "");
  const k = input.data.kpis;
  lines.push(`- MRR: $${k.mrr.toLocaleString()} (${(k.mrrGrowthRate * 100).toFixed(1)}% growth)`);
  lines.push(
    `- Logo churn: ${(k.logoChurnRate * 100).toFixed(1)}% (prior ${(k.priorLogoChurnRate * 100).toFixed(1)}%)`,
  );
  lines.push(`- Trial conversion: ${(k.trialConversionRate * 100).toFixed(1)}%`);
  lines.push(`- Gross retention: ${(k.grossRetentionRate * 100).toFixed(1)}%`);
  lines.push(`- Monthly burn: $${k.monthlyBurn.toLocaleString()}`);
  lines.push(`- Gross margin: ${(k.grossMarginRate * 100).toFixed(1)}%`);

  lines.push("", "## Key Project Updates", "");
  for (const project of input.data.projects) {
    lines.push(
      `- **${project.name}** (${project.status}, ${project.owner}, due ${project.dueDate}) — impact ${project.businessImpact}`,
    );
    if (project.blockers.length > 0) {
      lines.push(`  - Blockers: ${project.blockers.join("; ")}`);
    }
  }

  lines.push("", "## Customer Signals", "");
  lines.push(`- Support ticket trend: +${(input.data.customer.supportTicketTrendPct * 100).toFixed(0)}%`);
  lines.push(`- NPS: ${input.data.customer.nps} (prior ${input.data.customer.priorNps})`);
  lines.push(`- Churn reasons: ${input.data.customer.topChurnReasons.join("; ")}`);

  lines.push("", "## Sales / Revenue Signals", "");
  lines.push(`- Pipeline: $${input.data.sales.totalPipelineValue.toLocaleString()}`);
  lines.push(`- Win rate: ${(input.data.sales.winRate * 100).toFixed(0)}%`);
  lines.push(`- Enterprise pipeline growth: ${(input.data.sales.enterprisePipelineGrowth * 100).toFixed(0)}%`);
  for (const deal of input.data.sales.stalledDeals) {
    lines.push(`- Stalled: ${deal.account} $${deal.value.toLocaleString()} (${deal.daysStalled}d)`);
  }

  lines.push("", "## Operational Issues", "");
  for (const issue of input.data.operations) {
    lines.push(`- [${issue.severity}] ${issue.description} (${issue.status})`);
  }

  lines.push("", "## Recommended Actions", "");
  if (input.actions.length === 0) {
    lines.push("- No actions generated.");
  } else {
    for (const action of input.actions) {
      const approval = action.requiresApproval ? " — **requires approval**" : "";
      lines.push(`- **${action.id}** (${action.dueWindow}, ${action.ownerRole}): ${action.action}${approval}`);
    }
  }

  lines.push("", "## Watchlist", "");
  if (watchlist.length === 0) {
    lines.push("- No low-urgency watchlist items.");
  } else {
    for (const signal of watchlist.slice(0, 5)) {
      lines.push(`- ${signal.title}: ${signal.description}`);
    }
  }

  lines.push(
    "",
    "## Open Questions",
    "- Is MRR deceleration seasonal or tied to onboarding/churn fixes?",
    "- What explicit tradeoff do we want between enterprise launch date and Acme close?",
    "- Which paid channel tests are safe under current burn constraints?",
    "",
    "_V1 does not execute external actions; approval covers brief publication only._",
    "",
  );

  return lines.join("\n");
}

function appendAttentionSection(
  lines: string[],
  items: readonly { readonly title: string; readonly rationale: string; readonly sourceSignalIds: readonly string[] }[],
): void {
  if (items.length === 0) {
    lines.push("- None flagged at this priority level.");
    return;
  }
  for (const item of items) {
    lines.push(`- **${item.title}**`);
    lines.push(`  - ${item.rationale}`);
    lines.push(`  - Signals: ${item.sourceSignalIds.join(", ")}`);
  }
}
