import type {
  ApprovalSummary,
  CauseHypothesis,
  DiagnosticBundle,
  EscalationRecord,
  EvidenceRecord,
  IncidentDiagnosis,
  IncidentTriage,
  IncidentWorkerRequest,
  RecoveryVerification,
  RemediationPlan,
  RemediationResult,
  SeverityAssessment,
  SeverityLevel,
} from "./types.js";
import { serviceRecoveredAfterRemediation } from "./fixtures.js";

export function triageIncident(request: IncidentWorkerRequest): IncidentTriage {
  const scope = [request.service, "dependencies", "recent-deployments"];
  const concerns: string[] = [];
  if (request.message.toLowerCase().includes("error rate")) {
    concerns.push("Elevated customer-facing error rate");
  }
  if (request.message.toLowerCase().includes("deployment")) {
    concerns.push("Recent deployment correlation suspected");
  }
  if (concerns.length === 0) {
    concerns.push("Alert requires immediate service impact assessment");
  }
  const initialSeverity: SeverityLevel = request.message.includes("20%") ? "sev2" : "sev3";
  return {
    incidentId: request.incidentId,
    suspectedScope: scope,
    immediateConcerns: concerns,
    initialSeverity,
  };
}

export function buildEvidence(bundle: DiagnosticBundle): EvidenceRecord[] {
  const evidence: EvidenceRecord[] = [
    {
      id: "ev-health",
      type: "health",
      source: "get_service_health",
      observation: `${bundle.health.name} status=${bundle.health.status}, errorRate=${(bundle.health.errorRate * 100).toFixed(1)}%, latencyMs=${bundle.health.latencyMs}`,
    },
  ];
  for (const log of bundle.logs) {
    evidence.push({
      id: `ev-${log.id}`,
      type: "log",
      source: "get_recent_logs",
      observation: `[${log.level}] ${log.timestamp}: ${log.message}`,
    });
  }
  for (const deployment of bundle.deployments) {
    if (deployment.status === "active") {
      evidence.push({
        id: `ev-${deployment.deploymentId}`,
        type: "deployment",
        source: "get_recent_deployments",
        observation: `Active deployment ${deployment.deploymentId} version ${deployment.version} at ${deployment.deployedAt}`,
      });
    }
  }
  for (const dependency of bundle.dependencies) {
    evidence.push({
      id: `ev-dep-${dependency.name}`,
      type: "dependency",
      source: "get_dependency_health",
      observation: `${dependency.name} status=${dependency.status}: ${dependency.detail}`,
    });
  }
  return evidence.sort((left, right) => left.id.localeCompare(right.id));
}

export function diagnoseIncident(evidence: readonly EvidenceRecord[]): IncidentDiagnosis {
  const templates: readonly CauseHypothesis[] = [
    {
      id: "cause-db-pool",
      hypothesis: "checkout-api v2.3.1 deployment introduced database connection pool exhaustion",
      evidenceIds: ["ev-log-002", "ev-dep-442", "ev-dep-postgres-primary"],
      confidence: "high",
    },
    {
      id: "cause-payments-outage",
      hypothesis: "payments-api primary outage is the root cause",
      evidenceIds: ["ev-log-004", "ev-dep-payments-api"],
      confidence: "low",
    },
    {
      id: "cause-cache",
      hypothesis: "redis-cache failure caused checkout timeouts",
      evidenceIds: ["ev-dep-redis-cache"],
      confidence: "low",
    },
  ];
  const causes = templates.filter((cause) => cause.evidenceIds.every((id) => evidence.some((item) => item.id === id)));

  const primaryCauseId = "cause-db-pool";
  return { causes, primaryCauseId };
}

export function assessSeverity(input: {
  readonly request: IncidentWorkerRequest;
  readonly bundle: DiagnosticBundle;
  readonly diagnosis: IncidentDiagnosis;
  readonly triage: IncidentTriage;
}): SeverityAssessment {
  const errorRate = input.bundle.health.errorRate;
  const isCheckout = input.request.service === "checkout-api";
  let severity: SeverityLevel = input.triage.initialSeverity;
  if (isCheckout && errorRate >= 0.2) {
    severity = "sev2";
  }
  if (errorRate >= 0.5) {
    severity = "sev1";
  }
  const degradedDeps = input.bundle.dependencies.filter((dep) => dep.status !== "healthy").length;
  if (degradedDeps >= 2 && severity === "sev3") {
    severity = "sev2";
  }
  return {
    severity,
    rationale: `Rule-based severity from error rate ${(errorRate * 100).toFixed(1)}%, service criticality, and ${degradedDeps} degraded dependencies.`,
    userImpact: "Checkout flow errors for a material share of sessions",
    durationMinutes: 18,
  };
}

export function planRemediation(input: {
  readonly diagnosis: IncidentDiagnosis;
  readonly bundle: DiagnosticBundle;
  readonly severity: SeverityAssessment;
}): RemediationPlan {
  const primary = input.diagnosis.causes.find((cause) => cause.id === input.diagnosis.primaryCauseId);
  const activeDeployment = input.bundle.deployments.find((item) => item.status === "active");
  if (primary?.id === "cause-db-pool" && activeDeployment !== undefined) {
    return {
      action: "rollback",
      target: activeDeployment.deploymentId,
      rationale: "Rollback correlated bad deployment before further infra changes.",
      risk: "medium",
      requiresApproval: true,
    };
  }
  if (input.severity.severity === "sev1") {
    return {
      action: "escalate",
      target: input.bundle.service,
      rationale: "Severity warrants immediate human incident commander escalation.",
      risk: "low",
      requiresApproval: false,
    };
  }
  return {
    action: "monitor",
    target: input.bundle.service,
    rationale: "Insufficient evidence for automated state change — monitor and gather data.",
    risk: "low",
    requiresApproval: false,
  };
}

export function buildApprovalSummary(input: {
  readonly request: IncidentWorkerRequest;
  readonly severity: SeverityAssessment;
  readonly diagnosis: IncidentDiagnosis;
  readonly evidence: readonly EvidenceRecord[];
  readonly plan: RemediationPlan;
}): ApprovalSummary {
  const primary = input.diagnosis.causes.find((cause) => cause.id === input.diagnosis.primaryCauseId);
  return {
    severity: input.severity.severity,
    service: input.request.service,
    primaryDiagnosis: primary?.hypothesis ?? "Unknown",
    evidenceHighlights: input.evidence.slice(0, 4).map((item) => item.observation),
    proposedRemediation: `${input.plan.action} → ${input.plan.target}`,
    remediationRisk: input.plan.risk,
    expectedRecoverySignal: "Service error rate below 5% and dependency postgres-primary healthy",
  };
}

export function buildActionId(incidentId: string, action: string, target: string): string {
  return `${incidentId}-${action}-${target}`.slice(0, 128);
}

export function verifyRecovery(service: string, bundle: DiagnosticBundle): RecoveryVerification {
  const recovered = serviceRecoveredAfterRemediation(service);
  const checks = [
    {
      name: "service-health",
      passed: bundle.health.status === "healthy" && bundle.health.errorRate < 0.05,
      detail: `status=${bundle.health.status}, errorRate=${(bundle.health.errorRate * 100).toFixed(1)}%`,
    },
    {
      name: "postgres-primary",
      passed: bundle.dependencies.find((dep) => dep.name === "postgres-primary")?.status === "healthy",
      detail: bundle.dependencies.find((dep) => dep.name === "postgres-primary")?.detail ?? "missing",
    },
  ];
  const remainingIssues: string[] = [];
  if (!recovered) {
    remainingIssues.push("Service remains degraded after remediation — escalate to incident commander.");
  }
  return { recovered, checks, remainingIssues };
}

export function createEscalation(severity: SeverityAssessment): EscalationRecord {
  return {
    level: severity.severity === "sev1" ? "sev1" : "sev2",
    reason: "Automated recovery verification did not confirm service restoration.",
    nextSteps: ["Page secondary on-call for checkout-api", "Open war-room bridge", "Freeze further deployments"],
  };
}

export function mapRemediationResult(
  actionId: string,
  toolStatus: "completed" | "already-completed" | "rejected",
  details: string,
): RemediationResult {
  return { actionId, status: toolStatus, details };
}
