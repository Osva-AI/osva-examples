import type {
  ApprovalDecisionRecord,
  EscalationRecord,
  EvidenceRecord,
  IncidentDiagnosis,
  IncidentTriage,
  IncidentWorkerRequest,
  RecoveryVerification,
  RemediationPlan,
  RemediationResult,
  SeverityAssessment,
} from "./types.js";

export function renderIncidentReportMarkdown(input: {
  readonly request: IncidentWorkerRequest;
  readonly triage: IncidentTriage;
  readonly evidence: readonly EvidenceRecord[];
  readonly diagnosis: IncidentDiagnosis;
  readonly severity: SeverityAssessment;
  readonly plan: RemediationPlan;
  readonly approvalDecision?: ApprovalDecisionRecord;
  readonly remediation?: RemediationResult;
  readonly recovery?: RecoveryVerification;
  readonly escalation?: EscalationRecord;
}): string {
  const lines: string[] = [
    "# Incident Report",
    "",
    "## Incident",
    `- ID: ${input.request.incidentId}`,
    `- Service: ${input.request.service}`,
    `- Alert: ${input.request.alertType}`,
    `- Message: ${input.request.message}`,
    "",
    "## Executive Summary",
    `Severity ${input.severity.severity} incident on ${input.request.service}. Primary diagnosis: ${
      input.diagnosis.causes.find((cause) => cause.id === input.diagnosis.primaryCauseId)?.hypothesis ??
      "Under investigation"
    }.`,
    "",
    "## Severity",
    `- Level: ${input.severity.severity}`,
    `- Rationale: ${input.severity.rationale}`,
    `- User impact: ${input.severity.userImpact}`,
    "",
    "## Timeline",
    `- Triage scope: ${input.triage.suspectedScope.join(", ")}`,
    `- Immediate concerns: ${input.triage.immediateConcerns.join("; ")}`,
    ...(input.remediation === undefined
      ? []
      : [`- Remediation: ${input.remediation.status} — ${input.remediation.details}`]),
    "",
    "## Evidence Collected",
  ];
  for (const item of input.evidence) {
    lines.push(`- **${item.id}** (${item.type}/${item.source}): ${item.observation}`);
  }

  lines.push("", "## Diagnosis", "");
  const primary = input.diagnosis.causes.find((cause) => cause.id === input.diagnosis.primaryCauseId);
  lines.push(`Primary cause (**${input.diagnosis.primaryCauseId}**): ${primary?.hypothesis ?? "n/a"}`);

  lines.push("", "## Competing Hypotheses", "");
  for (const cause of input.diagnosis.causes) {
    if (cause.id === input.diagnosis.primaryCauseId) continue;
    lines.push(`- **${cause.id}** (${cause.confidence} confidence): ${cause.hypothesis}`);
  }

  lines.push(
    "",
    "## Remediation",
    `- Planned action: ${input.plan.action} → ${input.plan.target}`,
    `- Rationale: ${input.plan.rationale}`,
    `- Risk: ${input.plan.risk}`,
  );

  lines.push("", "## Approval Decision", "");
  if (input.approvalDecision === undefined) {
    lines.push("- No approval record merged into envelope (monitor-only path).");
  } else {
    lines.push(`- Decision: ${input.approvalDecision.decision}`);
  }

  lines.push("", "## Recovery Verification", "");
  if (input.recovery === undefined) {
    lines.push("- Recovery not verified in this path.");
  } else {
    lines.push(`- Recovered: ${input.recovery.recovered}`);
    for (const check of input.recovery.checks) {
      lines.push(`- Check ${check.name}: ${check.passed ? "pass" : "fail"} — ${check.detail}`);
    }
    if (input.recovery.remainingIssues.length > 0) {
      lines.push(`- Remaining: ${input.recovery.remainingIssues.join("; ")}`);
    }
  }

  lines.push("", "## Remaining Risks", "");
  if (input.recovery?.recovered === true) {
    lines.push("- Monitor for regression over next 24h; validate deployment guardrails.");
  } else {
    lines.push("- Service may still be impaired; maintain incident bridge until recovery confirmed.");
  }

  lines.push(
    "",
    "## Follow-up Actions",
    "- Post-incident review within 5 business days",
    "- Add deployment canary for checkout-api",
  );

  if (input.escalation !== undefined) {
    lines.push("", "## Escalation", `- Level: ${input.escalation.level}`, `- Reason: ${input.escalation.reason}`);
    for (const step of input.escalation.nextSteps) {
      lines.push(`- ${step}`);
    }
  }

  lines.push(
    "",
    "## Lessons / Preventive Actions",
    "- Expand connection pool alerts pre-deploy",
    "- Require automated rollback hook for checkout-api sev2+ error budget burn",
    "",
  );

  return lines.join("\n");
}
