export interface IncidentWorkerInput {
  readonly incidentId: string;
  readonly alertType: string;
  readonly service: string;
  readonly message: string;
}

export interface IncidentWorkerRequest extends IncidentWorkerInput {}

export type SeverityLevel = "sev1" | "sev2" | "sev3" | "sev4";

export interface IncidentTriage {
  readonly incidentId: string;
  readonly suspectedScope: readonly string[];
  readonly immediateConcerns: readonly string[];
  readonly initialSeverity: SeverityLevel;
}

export interface ServiceHealth {
  readonly name: string;
  readonly status: "healthy" | "degraded" | "down";
  readonly errorRate: number;
  readonly latencyMs: number;
}

export interface LogEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly level: "error" | "warn" | "info";
  readonly message: string;
  readonly service: string;
}

export interface DeploymentRecord {
  readonly deploymentId: string;
  readonly service: string;
  readonly version: string;
  readonly previousVersion: string;
  readonly deployedAt: string;
  readonly status: "active" | "rolled-back";
}

export interface DependencyHealth {
  readonly name: string;
  readonly status: "healthy" | "degraded" | "down";
  readonly detail: string;
}

export interface DiagnosticBundle {
  readonly service: string;
  readonly health: ServiceHealth;
  readonly logs: readonly LogEvent[];
  readonly deployments: readonly DeploymentRecord[];
  readonly dependencies: readonly DependencyHealth[];
}

export interface EvidenceRecord {
  readonly id: string;
  readonly type: "health" | "log" | "deployment" | "dependency";
  readonly source: string;
  readonly observation: string;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface CauseHypothesis {
  readonly id: string;
  readonly hypothesis: string;
  readonly evidenceIds: readonly string[];
  readonly confidence: ConfidenceLevel;
}

export interface IncidentDiagnosis {
  readonly causes: readonly CauseHypothesis[];
  readonly primaryCauseId: string;
}

export interface SeverityAssessment {
  readonly severity: SeverityLevel;
  readonly rationale: string;
  readonly userImpact: string;
  readonly durationMinutes: number;
}

export type RemediationActionType = "rollback" | "restart" | "monitor" | "escalate";

export interface RemediationPlan {
  readonly action: RemediationActionType;
  readonly target: string;
  readonly rationale: string;
  readonly risk: "high" | "medium" | "low";
  readonly requiresApproval: boolean;
}

export interface ApprovalSummary {
  readonly severity: SeverityLevel;
  readonly service: string;
  readonly primaryDiagnosis: string;
  readonly evidenceHighlights: readonly string[];
  readonly proposedRemediation: string;
  readonly remediationRisk: string;
  readonly expectedRecoverySignal: string;
}

export interface RemediationResult {
  readonly actionId: string;
  readonly status: "completed" | "already-completed" | "rejected";
  readonly details: string;
}

export interface RecoveryCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface RecoveryVerification {
  readonly recovered: boolean;
  readonly checks: readonly RecoveryCheck[];
  readonly remainingIssues: readonly string[];
}

export type RecoveryRoute = "recovered" | "unresolved";

export interface EscalationRecord {
  readonly level: SeverityLevel;
  readonly reason: string;
  readonly nextSteps: readonly string[];
}

export interface ApprovalDecisionRecord {
  readonly decision: "APPROVED" | "REJECTED";
  readonly comment?: string;
}
