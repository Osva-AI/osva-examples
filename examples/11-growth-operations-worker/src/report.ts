import type {
  ApprovalDecisionRecord,
  ApprovalSummary,
  CriticReview,
  CustomerInsightAnalysis,
  EvidenceRecord,
  ExecutionVerification,
  GrowthDiagnosis,
  GrowthOpportunity,
  GrowthOpsWorkerRequest,
  GrowthSignalBundle,
  PreparedAction,
  ResearchContext,
  SelectedIntervention,
  ActionExecutionResult,
} from "./types.js";

export function renderGrowthOperationsBriefMarkdown(input: {
  readonly request: GrowthOpsWorkerRequest;
  readonly signals: GrowthSignalBundle;
  readonly evidence: readonly EvidenceRecord[];
  readonly diagnosis: GrowthDiagnosis;
  readonly customerInsight: CustomerInsightAnalysis;
  readonly research: ResearchContext;
  readonly opportunities: readonly GrowthOpportunity[];
  readonly critic: CriticReview;
  readonly selected: SelectedIntervention;
  readonly prepared: PreparedAction;
  readonly approvalSummary: ApprovalSummary;
  readonly approvalDecision?: ApprovalDecisionRecord;
  readonly actionResult?: ActionExecutionResult;
  readonly verification?: ExecutionVerification;
}): string {
  const lines: string[] = [
    "# Growth Operations Brief",
    "",
    "## Objective",
    `- Business: ${input.request.businessId}`,
    `- Objective: ${input.request.objective}`,
    ...(input.request.context === undefined ? [] : [`- Context: ${input.request.context}`]),
    "",
    "## Executive Summary",
    `Primary growth constraint: **${input.diagnosis.constraint}**. Selected intervention: ${input.selected.opportunityId} (${input.selected.interventionRoute}).`,
    "",
    "## Growth Constraint",
    input.diagnosis.rationale,
    "",
    "## Evidence",
    ...input.evidence.slice(0, 8).map((item) => `- (${item.id}) ${item.observation}`),
    "",
    "## Customer Signals",
    input.customerInsight.summary,
    ...input.customerInsight.topThemes.map((theme) => `- Theme: ${theme}`),
    "",
    "## Funnel / Revenue Analysis",
    `- Sessions: ${input.signals.funnel.sessions.toLocaleString()}`,
    `- Purchases: ${input.signals.funnel.purchases.toLocaleString()}`,
    `- Revenue: $${input.signals.commerce.revenue.toLocaleString()}`,
    "",
    "## Research Context",
    ...input.research.notes.map((note) => `- ${note}`),
    "",
    "## Opportunities Considered",
    ...input.opportunities.map(
      (opp) => `- **${opp.id}**: ${opp.problem} (expected: ${opp.expectedMetric}, route: ${opp.interventionRoute})`,
    ),
    "",
    "## Critic Review",
    ...(input.critic.issues.length === 0
      ? ["- No critic issues recorded."]
      : input.critic.issues.map((issue) => `- [${issue.severity}] ${issue.message}`)),
    "",
    "## Selected Intervention",
    input.selected.rationale,
    "",
    "## Approval",
    input.approvalDecision === undefined
      ? "- Pending or not recorded in envelope."
      : `- Decision: ${input.approvalDecision.decision}${input.approvalDecision.comment === undefined ? "" : ` — ${input.approvalDecision.comment}`}`,
    "",
    "## Action Taken",
    input.actionResult === undefined
      ? "- No action executed."
      : `- ${input.actionResult.status}: ${input.actionResult.details}`,
    "",
    "## Measurement Plan",
    `- Monitor **${input.prepared.monitoringMetric}** after deployment of ${input.prepared.title}.`,
    "- This example records execution state only; it does not fabricate experiment outcomes.",
    "",
    "## Risks",
    `- Prepared action risk: ${input.prepared.risk}`,
    `- ${input.approvalSummary.riskReview}`,
    "",
    "## Follow-up",
    ...(input.verification === undefined
      ? ["- Verification not available."]
      : input.verification.notes.map((note) => `- ${note}`)),
  ];
  return lines.join("\n");
}
