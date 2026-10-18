import type { JsonObject, JsonValue, ToolVersionId } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";
import { isJsonRecord } from "@osva-examples/utils";

import {
  assessSeverity,
  buildActionId,
  buildApprovalSummary,
  buildEvidence,
  createEscalation,
  diagnoseIncident,
  mapRemediationResult,
  planRemediation,
  triageIncident,
  verifyRecovery,
} from "./incident.js";
import { buildIncidentWorkerRequest, validateIncidentWorkerInput } from "./input.js";
import { renderIncidentReportMarkdown } from "./report.js";
import type {
  ApprovalDecisionRecord,
  ApprovalSummary,
  CauseHypothesis,
  DiagnosticBundle,
  EscalationRecord,
  EvidenceRecord,
  IncidentDiagnosis,
  IncidentTriage,
  IncidentWorkerRequest,
  RecoveryRoute,
  RecoveryVerification,
  RemediationPlan,
  RemediationResult,
  SeverityAssessment,
} from "./types.js";

export const HEALTH_TOOL_BINDING = "incident_health_tool";
export const LOGS_TOOL_BINDING = "incident_logs_tool";
export const DEPLOYMENTS_TOOL_BINDING = "incident_deployments_tool";
export const DEPENDENCIES_TOOL_BINDING = "incident_dependencies_tool";
export const ROLLBACK_TOOL_BINDING = "incident_rollback_tool";
export const RESTART_TOOL_BINDING = "incident_restart_tool";

interface ParsedIncidentEnvelope {
  readonly request: IncidentWorkerRequest;
  readonly triage?: IncidentTriage;
  readonly diagnostics?: DiagnosticBundle;
  readonly evidence?: readonly EvidenceRecord[];
  readonly diagnosis?: IncidentDiagnosis;
  readonly severityAssessment?: SeverityAssessment;
  readonly remediationPlan?: RemediationPlan;
  readonly approvalSummary?: ApprovalSummary;
  readonly approvalDecision?: ApprovalDecisionRecord;
  readonly remediationResult?: RemediationResult;
  readonly recoveryVerification?: RecoveryVerification;
  readonly recoveryRoute?: RecoveryRoute;
  readonly escalation?: EscalationRecord;
}

interface RuntimeToolContext {
  readonly tools: {
    invoke(input: { binding: string; input: JsonObject; idempotencyKey: string }): Promise<JsonValue>;
  };
}

export const incidentResponseRuntime = createRuntime({
  execute: async (input, context) => {
    const envelope = parseEnvelope(input);

    if (envelope.triage === undefined) {
      return toWorkflowJson({ ...envelope, triage: triageIncident(envelope.request) });
    }

    if (envelope.diagnostics === undefined) {
      const diagnostics = await collectDiagnostics(envelope.request.service, context);
      return toWorkflowJson({ ...envelope, diagnostics });
    }

    if (envelope.evidence === undefined) {
      return toWorkflowJson({ ...envelope, evidence: buildEvidence(envelope.diagnostics) });
    }

    if (envelope.diagnosis === undefined) {
      return toWorkflowJson({ ...envelope, diagnosis: diagnoseIncident(envelope.evidence) });
    }

    if (envelope.severityAssessment === undefined) {
      const severityAssessment = assessSeverity({
        request: envelope.request,
        bundle: envelope.diagnostics,
        diagnosis: envelope.diagnosis,
        triage: envelope.triage,
      });
      return toWorkflowJson({ ...envelope, severityAssessment });
    }

    if (envelope.remediationPlan === undefined) {
      const remediationPlan = planRemediation({
        diagnosis: envelope.diagnosis,
        bundle: envelope.diagnostics,
        severity: envelope.severityAssessment,
      });
      const approvalSummary = buildApprovalSummary({
        request: envelope.request,
        severity: envelope.severityAssessment,
        diagnosis: envelope.diagnosis,
        evidence: envelope.evidence,
        plan: remediationPlan,
      });
      return toWorkflowJson({ ...envelope, remediationPlan, approvalSummary });
    }

    if (envelope.remediationResult === undefined) {
      if (envelope.remediationPlan === undefined) {
        throw new Error("Remediation plan is required before execution.");
      }
      const remediationResult = await executeRemediation(
        { ...envelope, remediationPlan: envelope.remediationPlan, request: envelope.request },
        context,
      );
      return toWorkflowJson({ ...envelope, remediationResult });
    }

    if (envelope.recoveryVerification === undefined) {
      const diagnostics = await collectDiagnostics(envelope.request.service, context);
      const recoveryVerification = verifyRecovery(envelope.request.service, diagnostics);
      const recoveryRoute: RecoveryRoute = recoveryVerification.recovered ? "recovered" : "unresolved";
      return toWorkflowJson({
        ...envelope,
        diagnostics,
        recoveryVerification,
        recoveryRoute,
      });
    }

    if (envelope.recoveryRoute === "unresolved" && envelope.escalation === undefined) {
      return toWorkflowJson({
        ...envelope,
        escalation: createEscalation(envelope.severityAssessment),
      });
    }

    const markdown = renderIncidentReportMarkdown({
      request: envelope.request,
      triage: envelope.triage,
      evidence: envelope.evidence,
      diagnosis: envelope.diagnosis,
      severity: envelope.severityAssessment,
      plan: envelope.remediationPlan,
      approvalDecision: envelope.approvalDecision,
      remediation: envelope.remediationResult,
      recovery: envelope.recoveryVerification,
      escalation: envelope.escalation,
    });
    const artifact = await context.artifacts.create({
      name: `incident-report-${envelope.request.incidentId}.md`,
      mediaType: "text/markdown",
      content: new Blob([markdown], { type: "text/markdown" }),
      metadata: { example: "10-incident-response-worker", incidentId: envelope.request.incidentId },
      idempotencyKey: `incident-report-${envelope.request.incidentId}`,
    });
    return toWorkflowJson({
      ...envelope,
      report: {
        artifact: artifact.reference,
        name: artifact.name,
        mediaType: artifact.mediaType,
        recovered: envelope.recoveryVerification.recovered,
      },
    });
  },
});

async function collectDiagnostics(service: string, context: RuntimeToolContext): Promise<DiagnosticBundle> {
  const input = { service };
  const prefix = `diag-${service}`;
  const [healthResult, logsResult, deploymentsResult, dependenciesResult] = await Promise.all([
    context.tools.invoke({ binding: HEALTH_TOOL_BINDING, input, idempotencyKey: `${prefix}-health` }),
    context.tools.invoke({ binding: LOGS_TOOL_BINDING, input, idempotencyKey: `${prefix}-logs` }),
    context.tools.invoke({ binding: DEPLOYMENTS_TOOL_BINDING, input, idempotencyKey: `${prefix}-deployments` }),
    context.tools.invoke({ binding: DEPENDENCIES_TOOL_BINDING, input, idempotencyKey: `${prefix}-dependencies` }),
  ]);
  return {
    service,
    health: normalizeHealth(extractNested(healthResult, "health")),
    logs: normalizeLogs(extractArray(logsResult, "logs")),
    deployments: normalizeDeployments(extractArray(deploymentsResult, "deployments")),
    dependencies: normalizeDependencies(extractArray(dependenciesResult, "dependencies")),
  };
}

async function executeRemediation(
  envelope: ParsedIncidentEnvelope & {
    readonly remediationPlan: RemediationPlan;
    readonly request: IncidentWorkerRequest;
  },
  context: RuntimeToolContext,
): Promise<RemediationResult> {
  const plan = envelope.remediationPlan;
  const actionId = buildActionId(envelope.request.incidentId, plan.action, plan.target);

  if (plan.requiresApproval) {
    const decision = envelope.approvalDecision?.decision ?? "APPROVED";
    if (decision === "REJECTED") {
      return mapRemediationResult(actionId, "rejected", "Human reviewer rejected state-changing remediation.");
    }
  }

  if (plan.action === "monitor" || plan.action === "escalate") {
    return mapRemediationResult(actionId, "completed", `No state-changing tool executed for ${plan.action}.`);
  }

  if (plan.action === "rollback") {
    const toolResult = await context.tools.invoke({
      binding: ROLLBACK_TOOL_BINDING,
      input: { service: envelope.request.service, deploymentId: plan.target, actionId },
      idempotencyKey: actionId,
    });
    const result = extractNested(toolResult, "result");
    const status = readResultStatus(result);
    const details = typeof result["details"] === "string" ? result["details"] : "Rollback finished.";
    return mapRemediationResult(actionId, status, details);
  }

  if (plan.action === "restart") {
    const toolResult = await context.tools.invoke({
      binding: RESTART_TOOL_BINDING,
      input: { service: envelope.request.service, actionId },
      idempotencyKey: actionId,
    });
    const result = extractNested(toolResult, "result");
    const status = readResultStatus(result);
    const details = typeof result["details"] === "string" ? result["details"] : "Restart finished.";
    return mapRemediationResult(actionId, status, details);
  }

  return mapRemediationResult(actionId, "rejected", "Unsupported remediation action.");
}

function readResultStatus(record: JsonObject): RemediationResult["status"] {
  const status = record["status"];
  if (status === "completed" || status === "already-completed" || status === "rejected") {
    return status;
  }
  throw new Error("Tool result status is invalid.");
}

function extractNested(raw: JsonValue, field: string): JsonObject {
  if (!isJsonRecord(raw)) throw new Error(`Expected object for ${field}.`);
  const nested = raw[field];
  if (nested === undefined || !isJsonRecord(nested)) throw new Error(`Missing ${field}.`);
  return nested;
}

function extractArray(raw: JsonValue, field: string): JsonValue[] {
  if (!isJsonRecord(raw)) throw new Error(`Expected object for ${field}.`);
  const nested = raw[field];
  if (!Array.isArray(nested)) throw new Error(`Missing array ${field}.`);
  return nested;
}

function normalizeHealth(raw: JsonObject): DiagnosticBundle["health"] {
  const status = raw["status"];
  if (status !== "healthy" && status !== "degraded" && status !== "down") {
    throw new Error("Invalid health status.");
  }
  return {
    name: String(raw["name"]),
    status,
    errorRate: Number(raw["errorRate"]),
    latencyMs: Number(raw["latencyMs"]),
  };
}

function normalizeLogs(raw: JsonValue[]): DiagnosticBundle["logs"] {
  return raw.map((item) => {
    if (!isJsonRecord(item)) throw new Error("Log malformed.");
    return {
      id: String(item["id"]),
      timestamp: String(item["timestamp"]),
      level: item["level"] as "error" | "warn" | "info",
      message: String(item["message"]),
      service: String(item["service"]),
    };
  });
}

function normalizeDeployments(raw: JsonValue[]): DiagnosticBundle["deployments"] {
  return raw.map((item) => {
    if (!isJsonRecord(item)) throw new Error("Deployment malformed.");
    return {
      deploymentId: String(item["deploymentId"]),
      service: String(item["service"]),
      version: String(item["version"]),
      previousVersion: String(item["previousVersion"]),
      deployedAt: String(item["deployedAt"]),
      status: item["status"] as "active" | "rolled-back",
    };
  });
}

function normalizeDependencies(raw: JsonValue[]): DiagnosticBundle["dependencies"] {
  return raw.map((item) => {
    if (!isJsonRecord(item)) throw new Error("Dependency malformed.");
    return {
      name: String(item["name"]),
      status: item["status"] as "healthy" | "degraded" | "down",
      detail: String(item["detail"]),
    };
  });
}

export function buildIncidentResponseAgentManifest(
  runtimeUrl: string,
  toolVersionIds: {
    readonly health: ToolVersionId;
    readonly logs: ToolVersionId;
    readonly deployments: ToolVersionId;
    readonly dependencies: ToolVersionId;
    readonly rollback: ToolVersionId;
    readonly restart: ToolVersionId;
  },
) {
  return {
    schemaVersion: "1" as const,
    key: "incident-response-agent",
    name: "Incident Response Agent",
    runtime: {
      type: "REMOTE_HTTP" as const,
      protocolVersion: "1" as const,
      endpoint: runtimeUrl,
      timeoutMs: 45_000,
    },
    input: {
      schema: {
        type: "object",
        properties: {
          request: {
            type: "object",
            properties: {
              incidentId: { type: "string" },
              alertType: { type: "string" },
              service: { type: "string" },
              message: { type: "string" },
            },
            required: ["incidentId", "alertType", "service", "message"],
          },
        },
        required: ["request"],
      },
    },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 45_000, maxAttempts: 1 },
    capabilities: {
      model: false,
      tools: [
        HEALTH_TOOL_BINDING,
        LOGS_TOOL_BINDING,
        DEPLOYMENTS_TOOL_BINDING,
        DEPENDENCIES_TOOL_BINDING,
        ROLLBACK_TOOL_BINDING,
        RESTART_TOOL_BINDING,
      ],
    },
    tools: {
      [HEALTH_TOOL_BINDING]: { toolVersionId: toolVersionIds.health },
      [LOGS_TOOL_BINDING]: { toolVersionId: toolVersionIds.logs },
      [DEPLOYMENTS_TOOL_BINDING]: { toolVersionId: toolVersionIds.deployments },
      [DEPENDENCIES_TOOL_BINDING]: { toolVersionId: toolVersionIds.dependencies },
      [ROLLBACK_TOOL_BINDING]: { toolVersionId: toolVersionIds.rollback },
      [RESTART_TOOL_BINDING]: { toolVersionId: toolVersionIds.restart },
    },
  };
}

export function parseEnvelope(input: JsonValue): ParsedIncidentEnvelope {
  if (!isJsonRecord(input)) throw new Error("Workflow input must be an object.");
  const requestRaw = input["request"];
  if (requestRaw === undefined || !isJsonRecord(requestRaw)) throw new Error("Missing request.");
  const validated = validateIncidentWorkerInput(requestRaw);
  const request = buildIncidentWorkerRequest(validated);
  const envelope: ParsedIncidentEnvelope = { request };

  const triageRaw = input["triage"];
  if (triageRaw === undefined) return envelope;

  const diagnosticsRaw = input["diagnostics"];
  if (diagnosticsRaw === undefined) {
    return { ...envelope, triage: parseTriage(triageRaw) };
  }

  const evidenceRaw = input["evidence"];
  const base = {
    ...envelope,
    triage: parseTriage(triageRaw),
    diagnostics: parseDiagnostics(diagnosticsRaw, request.service),
  };
  if (evidenceRaw === undefined) return base;

  const diagnosisRaw = input["diagnosis"];
  const withEvidence = { ...base, evidence: parseEvidence(evidenceRaw) };
  if (diagnosisRaw === undefined) return withEvidence;

  const severityRaw = input["severityAssessment"];
  const withDiagnosis = { ...withEvidence, diagnosis: parseDiagnosis(diagnosisRaw) };
  if (severityRaw === undefined) return withDiagnosis;

  const planRaw = input["remediationPlan"];
  const withSeverity = { ...withDiagnosis, severityAssessment: parseSeverity(severityRaw) };
  if (planRaw === undefined) return withSeverity;

  const remediationResultRaw = input["remediationResult"];
  const withPlan = {
    ...withSeverity,
    remediationPlan: parsePlan(planRaw),
    approvalSummary:
      input["approvalSummary"] === undefined ? undefined : parseApprovalSummary(input["approvalSummary"]),
    approvalDecision:
      input["approvalDecision"] === undefined ? undefined : parseApprovalDecision(input["approvalDecision"]),
  };
  if (remediationResultRaw === undefined) return withPlan;

  const recoveryRaw = input["recoveryVerification"];
  const withRemediation = { ...withPlan, remediationResult: parseRemediationResult(remediationResultRaw) };
  if (recoveryRaw === undefined) return withRemediation;

  const routeRaw = input["recoveryRoute"];
  const withRecovery = {
    ...withRemediation,
    recoveryVerification: parseRecovery(recoveryRaw),
    recoveryRoute: routeRaw === "recovered" || routeRaw === "unresolved" ? (routeRaw as RecoveryRoute) : undefined,
  };

  const escalationRaw = input["escalation"];
  if (escalationRaw === undefined) return withRecovery;
  return { ...withRecovery, escalation: parseEscalation(escalationRaw) };
}

function toWorkflowJson(envelope: ParsedIncidentEnvelope & { readonly report?: JsonObject }): JsonObject {
  return {
    request: { ...envelope.request },
    ...(envelope.triage === undefined ? {} : { triage: { ...envelope.triage } }),
    ...(envelope.diagnostics === undefined ? {} : { diagnostics: bundleToJson(envelope.diagnostics) }),
    ...(envelope.evidence === undefined ? {} : { evidence: envelope.evidence.map((item) => ({ ...item })) }),
    ...(envelope.diagnosis === undefined
      ? {}
      : {
          diagnosis: {
            ...envelope.diagnosis,
            causes: envelope.diagnosis.causes.map((c) => ({ ...c, evidenceIds: [...c.evidenceIds] })),
          },
        }),
    ...(envelope.severityAssessment === undefined ? {} : { severityAssessment: { ...envelope.severityAssessment } }),
    ...(envelope.remediationPlan === undefined ? {} : { remediationPlan: { ...envelope.remediationPlan } }),
    ...(envelope.approvalSummary === undefined ? {} : { approvalSummary: { ...envelope.approvalSummary } }),
    ...(envelope.approvalDecision === undefined ? {} : { approvalDecision: { ...envelope.approvalDecision } }),
    ...(envelope.remediationResult === undefined ? {} : { remediationResult: { ...envelope.remediationResult } }),
    ...(envelope.recoveryVerification === undefined
      ? {}
      : {
          recoveryVerification: {
            ...envelope.recoveryVerification,
            checks: envelope.recoveryVerification.checks.map((c) => ({ ...c })),
            remainingIssues: [...envelope.recoveryVerification.remainingIssues],
          },
        }),
    ...(envelope.recoveryRoute === undefined ? {} : { recoveryRoute: envelope.recoveryRoute }),
    ...(envelope.escalation === undefined
      ? {}
      : { escalation: { ...envelope.escalation, nextSteps: [...envelope.escalation.nextSteps] } }),
    ...(envelope.report === undefined ? {} : { report: envelope.report }),
  };
}

function bundleToJson(bundle: DiagnosticBundle): JsonObject {
  return {
    service: bundle.service,
    health: { ...bundle.health },
    logs: bundle.logs.map((item) => ({ ...item })),
    deployments: bundle.deployments.map((item) => ({ ...item })),
    dependencies: bundle.dependencies.map((item) => ({ ...item })),
  };
}

function parseTriage(raw: JsonValue): IncidentTriage {
  if (!isJsonRecord(raw)) throw new Error("Triage malformed.");
  return {
    incidentId: String(raw["incidentId"]),
    suspectedScope: Array.isArray(raw["suspectedScope"]) ? raw["suspectedScope"].map(String) : [],
    immediateConcerns: Array.isArray(raw["immediateConcerns"]) ? raw["immediateConcerns"].map(String) : [],
    initialSeverity: raw["initialSeverity"] as IncidentTriage["initialSeverity"],
  };
}

function parseDiagnostics(raw: JsonValue, service: string): DiagnosticBundle {
  if (!isJsonRecord(raw)) throw new Error("Diagnostics malformed.");
  const healthRaw = raw["health"];
  const logsRaw = raw["logs"];
  const deploymentsRaw = raw["deployments"];
  const dependenciesRaw = raw["dependencies"];
  if (
    healthRaw === undefined ||
    !isJsonRecord(healthRaw) ||
    !Array.isArray(logsRaw) ||
    !Array.isArray(deploymentsRaw) ||
    !Array.isArray(dependenciesRaw)
  ) {
    throw new Error("Diagnostics fields malformed.");
  }
  return {
    service,
    health: normalizeHealth(healthRaw),
    logs: normalizeLogs(logsRaw),
    deployments: normalizeDeployments(deploymentsRaw),
    dependencies: normalizeDependencies(dependenciesRaw),
  };
}

function parseEvidence(raw: JsonValue): EvidenceRecord[] {
  if (!Array.isArray(raw)) throw new Error("Evidence must be array.");
  return raw.map((item) => {
    if (!isJsonRecord(item)) throw new Error("Evidence item malformed.");
    return {
      id: String(item["id"]),
      type: item["type"] as EvidenceRecord["type"],
      source: String(item["source"]),
      observation: String(item["observation"]),
    };
  });
}

function parseDiagnosis(raw: JsonValue): IncidentDiagnosis {
  if (!isJsonRecord(raw)) throw new Error("Diagnosis malformed.");
  const causesRaw = raw["causes"];
  if (!Array.isArray(causesRaw)) throw new Error("Diagnosis causes missing.");
  return {
    primaryCauseId: String(raw["primaryCauseId"]),
    causes: causesRaw.map((item) => {
      if (!isJsonRecord(item)) throw new Error("Cause malformed.");
      return {
        id: String(item["id"]),
        hypothesis: String(item["hypothesis"]),
        evidenceIds: Array.isArray(item["evidenceIds"]) ? item["evidenceIds"].map(String) : [],
        confidence: item["confidence"] as CauseHypothesis["confidence"],
      };
    }),
  };
}

function parseSeverity(raw: JsonValue): SeverityAssessment {
  if (!isJsonRecord(raw)) throw new Error("Severity malformed.");
  return {
    severity: raw["severity"] as SeverityAssessment["severity"],
    rationale: String(raw["rationale"]),
    userImpact: String(raw["userImpact"]),
    durationMinutes: Number(raw["durationMinutes"]),
  };
}

function parsePlan(raw: JsonValue): RemediationPlan {
  if (!isJsonRecord(raw)) throw new Error("Plan malformed.");
  return {
    action: raw["action"] as RemediationPlan["action"],
    target: String(raw["target"]),
    rationale: String(raw["rationale"]),
    risk: raw["risk"] as RemediationPlan["risk"],
    requiresApproval: Boolean(raw["requiresApproval"]),
  };
}

function parseApprovalSummary(raw: JsonValue): ApprovalSummary {
  if (!isJsonRecord(raw)) throw new Error("Approval summary malformed.");
  return {
    severity: raw["severity"] as ApprovalSummary["severity"],
    service: String(raw["service"]),
    primaryDiagnosis: String(raw["primaryDiagnosis"]),
    evidenceHighlights: Array.isArray(raw["evidenceHighlights"]) ? raw["evidenceHighlights"].map(String) : [],
    proposedRemediation: String(raw["proposedRemediation"]),
    remediationRisk: String(raw["remediationRisk"]),
    expectedRecoverySignal: String(raw["expectedRecoverySignal"]),
  };
}

function parseApprovalDecision(raw: JsonValue): ApprovalDecisionRecord {
  if (!isJsonRecord(raw)) throw new Error("Approval decision malformed.");
  return {
    decision: raw["decision"] as ApprovalDecisionRecord["decision"],
    ...(typeof raw["comment"] === "string" ? { comment: raw["comment"] } : {}),
  };
}

function parseRemediationResult(raw: JsonValue): RemediationResult {
  if (!isJsonRecord(raw)) throw new Error("Remediation result malformed.");
  return {
    actionId: String(raw["actionId"]),
    status: raw["status"] as RemediationResult["status"],
    details: String(raw["details"]),
  };
}

function parseRecovery(raw: JsonValue): RecoveryVerification {
  if (!isJsonRecord(raw)) throw new Error("Recovery malformed.");
  const checksRaw = raw["checks"];
  if (!Array.isArray(checksRaw)) throw new Error("Recovery checks missing.");
  return {
    recovered: Boolean(raw["recovered"]),
    checks: checksRaw.map((item) => {
      if (!isJsonRecord(item)) throw new Error("Check malformed.");
      return { name: String(item["name"]), passed: Boolean(item["passed"]), detail: String(item["detail"]) };
    }),
    remainingIssues: Array.isArray(raw["remainingIssues"]) ? raw["remainingIssues"].map(String) : [],
  };
}

function parseEscalation(raw: JsonValue): EscalationRecord {
  if (!isJsonRecord(raw)) throw new Error("Escalation malformed.");
  return {
    level: raw["level"] as EscalationRecord["level"],
    reason: String(raw["reason"]),
    nextSteps: Array.isArray(raw["nextSteps"]) ? raw["nextSteps"].map(String) : [],
  };
}
