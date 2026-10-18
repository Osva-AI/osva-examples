import type {
  ApprovalSummary,
  BriefReview,
  OpportunityPrioritization,
  ProblemCluster,
  ProductBrief,
  ProductEvidenceBundle,
  ProductWorkerRequest,
} from "./types.js";

export function renderProductBriefMarkdown(input: {
  readonly request: ProductWorkerRequest;
  readonly evidence: ProductEvidenceBundle;
  readonly clusters: readonly ProblemCluster[];
  readonly prioritization: OpportunityPrioritization;
  readonly brief: ProductBrief;
  readonly review: BriefReview;
  readonly approvalSummary: ApprovalSummary;
}): string {
  const top = input.prioritization.opportunities[0];
  const lines: string[] = [
    "# Product Brief",
    "",
    "_Lightweight PRD scope: problem, evidence, and proposed direction — not a full engineering specification._",
    "",
    "## Problem",
    input.brief.problem,
    "",
    "## Target User",
    input.brief.targetUser,
    "",
    "## Evidence",
    "",
    "### Customer Feedback",
  ];

  const feedbackById = new Map(input.evidence.feedback.map((item) => [item.id, item]));
  const ticketById = new Map(input.evidence.tickets.map((item) => [item.id, item]));
  const topCluster = input.clusters.find((cluster) => cluster.id === top?.problemClusterId);

  if (topCluster === undefined) {
    lines.push("- (no cluster selected)");
  } else {
    for (const id of topCluster.feedbackIds) {
      const item = feedbackById.get(id);
      lines.push(`- **${id}** (${item?.customerSegment ?? "unknown"}): ${item?.text ?? ""}`);
    }
    lines.push("", "### Support Signals");
    for (const id of topCluster.ticketIds) {
      const item = ticketById.get(id);
      lines.push(`- **${id}** [${item?.category ?? ""}]: ${item?.text ?? ""}`);
    }
  }

  lines.push("", "### Product Metrics");
  lines.push(`- Signups: ${input.evidence.metrics.signups.toLocaleString()}`);
  lines.push(`- Onboarding completed: ${input.evidence.metrics.onboardingCompleted.toLocaleString()}`);
  lines.push(`- Activation rate: ${(input.evidence.metrics.activationRate * 100).toFixed(1)}%`);
  lines.push(`- Week-one retention: ${(input.evidence.metrics.weekOneRetention * 100).toFixed(1)}%`);
  for (const step of input.evidence.metrics.onboardingSteps) {
    const rate = step.started > 0 ? ((step.completed / step.started) * 100).toFixed(1) : "n/a";
    lines.push(`- Step \`${step.step}\`: ${step.completed}/${step.started} (${rate}%)`);
  }

  lines.push(
    "",
    "## Opportunity",
    top === undefined ? "(none)" : `${top.id}: ${top.userProblem}`,
    "",
    "## Why Now",
    `Strategic objective: ${input.evidence.context.strategicObjective}`,
    `Product objective: ${input.request.objective ?? input.brief.goal}`,
    "",
    "## Goals",
    `- ${input.brief.goal}`,
    "",
    "## Non-Goals",
    ...input.brief.nonGoals.map((item) => `- ${item}`),
    "",
    "## Proposed Approach",
    ...input.brief.proposedApproach.map((item) => `- ${item}`),
    "",
    "## Success Metrics",
    ...input.brief.successMetrics.map((item) => `- ${item}`),
    "",
    "## Risks",
    ...input.brief.risks.map((item) => `- ${item}`),
    "",
    "## Open Questions",
    ...input.brief.openQuestions.map((item) => `- ${item}`),
    "",
    "## Reviewer Concerns",
  );

  if (input.review.issues.length === 0) {
    lines.push("- None flagged by deterministic review.");
  } else {
    for (const issue of input.review.issues) {
      lines.push(`- **${issue.type}**: ${issue.description}`);
    }
  }

  lines.push(
    "",
    "## Prioritization Notes",
    input.prioritization.method,
    top === undefined ? "" : `- Top opportunity rationale: ${top.rationale}`,
    "",
    "## Next Steps",
    ...input.approvalSummary.proposedApproach.map((item) => `- ${item}`),
    "- Align design and engineering on success metrics before build.",
    "",
  );

  return lines.join("\n");
}

export function buildApprovalSummary(input: {
  readonly brief: ProductBrief;
  readonly prioritization: OpportunityPrioritization;
  readonly review: BriefReview;
}): ApprovalSummary {
  const top = input.prioritization.opportunities[0];
  return {
    chosenProblem: input.brief.problem,
    evidenceHighlights: input.brief.evidence.slice(0, 4),
    prioritizationRationale: top?.rationale ?? "No prioritized opportunity available.",
    proposedApproach: [...input.brief.proposedApproach],
    successMetrics: [...input.brief.successMetrics],
    reviewerConcerns: input.review.issues.map((issue) => `${issue.type}: ${issue.description}`),
  };
}
