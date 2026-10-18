import { workflowDefinitionSchema } from "@osva-ai/contracts/schemas";
import { describe, expect, it, vi } from "vitest";

import {
  executeGetDependencyHealth,
  executeGetRecentDeployments,
  executeGetRecentLogs,
  executeGetServiceHealth,
  executeRollbackDeployment,
} from "../src/connector.js";
import {
  getFixtureDependencyHealth,
  getFixtureRecentDeployments,
  getFixtureRecentLogs,
  getFixtureServiceHealth,
  resetIncidentFixtures,
  restartService,
  rollbackDeployment,
  serviceRecoveredAfterRemediation,
} from "../src/fixtures.js";
import {
  assessSeverity,
  buildApprovalSummary,
  buildEvidence,
  createEscalation,
  diagnoseIncident,
  planRemediation,
  triageIncident,
  verifyRecovery,
} from "../src/incident.js";
import {
  DEFAULT_ALERT_TYPE,
  DEFAULT_INCIDENT_MESSAGE,
  DEFAULT_INCIDENT_SERVICE,
  buildIncidentWorkerRequest,
  validateIncidentWorkerInput,
} from "../src/input.js";
import { renderIncidentReportMarkdown } from "../src/report.js";
import {
  DEPENDENCIES_TOOL_BINDING,
  HEALTH_TOOL_BINDING,
  ROLLBACK_TOOL_BINDING,
  buildIncidentResponseAgentManifest,
} from "../src/runtime.js";
import {
  APPROVAL_NODE,
  BRANCH_NODE,
  COLLECT_NODE,
  EXECUTE_NODE,
  PLAN_NODE,
  REPORT_NODE,
  WORKFLOW_LINEAR_STAGE_ORDER,
  buildWorkflowDefinition,
} from "../src/workflow.js";

function loadDemoBundle(service: string = DEFAULT_INCIDENT_SERVICE) {
  return {
    service,
    health: getFixtureServiceHealth(service),
    logs: getFixtureRecentLogs(service),
    deployments: getFixtureRecentDeployments(service),
    dependencies: getFixtureDependencyHealth(service),
  };
}

describe("incident response worker public contracts", () => {
  it("validates incident request input bounds", () => {
    const incidentId = "inc-demo-001";
    expect(
      validateIncidentWorkerInput({
        incidentId,
        alertType: DEFAULT_ALERT_TYPE,
        service: DEFAULT_INCIDENT_SERVICE,
        message: DEFAULT_INCIDENT_MESSAGE,
      }),
    ).toEqual({
      incidentId,
      alertType: DEFAULT_ALERT_TYPE,
      service: DEFAULT_INCIDENT_SERVICE,
      message: DEFAULT_INCIDENT_MESSAGE,
    });
    expect(() =>
      validateIncidentWorkerInput({
        incidentId: "",
        alertType: DEFAULT_ALERT_TYPE,
        service: DEFAULT_INCIDENT_SERVICE,
        message: DEFAULT_INCIDENT_MESSAGE,
      }),
    ).toThrow(/incidentId/);
    expect(() =>
      validateIncidentWorkerInput({
        incidentId: "inc-bad01",
        alertType: DEFAULT_ALERT_TYPE,
        service: "Bad_Service",
        message: DEFAULT_INCIDENT_MESSAGE,
      }),
    ).toThrow(/service/);
    expect(() =>
      validateIncidentWorkerInput({
        incidentId: "inc-long01",
        alertType: DEFAULT_ALERT_TYPE,
        service: DEFAULT_INCIDENT_SERVICE,
        message: "x".repeat(501),
      }),
    ).toThrow(/message/);
  });

  it("loads health, logs, deployment, and dependency fixtures through MCP handlers", async () => {
    resetIncidentFixtures();
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const health = await executeGetServiceHealth({ service: DEFAULT_INCIDENT_SERVICE });
    const logs = await executeGetRecentLogs({ service: DEFAULT_INCIDENT_SERVICE });
    const deployments = await executeGetRecentDeployments({ service: DEFAULT_INCIDENT_SERVICE });
    const dependencies = await executeGetDependencyHealth({ service: DEFAULT_INCIDENT_SERVICE });
    write.mockRestore();
    expect(health.health.status).toBe("degraded");
    expect(health.health.errorRate).toBeCloseTo(0.23);
    expect(logs.logs.some((item) => item.message.includes("pool exhausted"))).toBe(true);
    expect(deployments.deployments.some((item) => item.deploymentId === "dep-442")).toBe(true);
    expect(dependencies.dependencies.some((item) => item.name === "postgres-primary")).toBe(true);
  });

  it("diagnoses the strongest database pool hypothesis and keeps competing causes", () => {
    resetIncidentFixtures();
    const request = buildIncidentWorkerRequest(
      validateIncidentWorkerInput({
        incidentId: "inc-diagnose-001",
        alertType: DEFAULT_ALERT_TYPE,
        service: DEFAULT_INCIDENT_SERVICE,
        message: DEFAULT_INCIDENT_MESSAGE,
      }),
    );
    const bundle = loadDemoBundle();
    const evidence = buildEvidence(bundle);
    const diagnosis = diagnoseIncident(evidence);
    expect(diagnosis.primaryCauseId).toBe("cause-db-pool");
    expect(diagnosis.causes.find((cause) => cause.id === "cause-db-pool")?.confidence).toBe("high");
    expect(diagnosis.causes.some((cause) => cause.id === "cause-payments-outage")).toBe(true);
    expect(triageIncident(request).initialSeverity).toBe("sev2");
  });

  it("assesses severity with transparent checkout error-rate rules", () => {
    resetIncidentFixtures();
    const request = buildIncidentWorkerRequest(
      validateIncidentWorkerInput({
        incidentId: "inc-sev-001",
        alertType: DEFAULT_ALERT_TYPE,
        service: DEFAULT_INCIDENT_SERVICE,
        message: DEFAULT_INCIDENT_MESSAGE,
      }),
    );
    const bundle = loadDemoBundle();
    const evidence = buildEvidence(bundle);
    const diagnosis = diagnoseIncident(evidence);
    const triage = triageIncident(request);
    const severity = assessSeverity({ request, bundle, diagnosis, triage });
    expect(severity.severity).toBe("sev2");
    expect(severity.rationale).toMatch(/error rate/i);
  });

  it("plans rollback remediation that requires approval", () => {
    resetIncidentFixtures();
    const bundle = loadDemoBundle();
    const evidence = buildEvidence(bundle);
    const diagnosis = diagnoseIncident(evidence);
    const severity = assessSeverity({
      request: buildIncidentWorkerRequest(
        validateIncidentWorkerInput({
          incidentId: "inc-plan-001",
          alertType: DEFAULT_ALERT_TYPE,
          service: DEFAULT_INCIDENT_SERVICE,
          message: DEFAULT_INCIDENT_MESSAGE,
        }),
      ),
      bundle,
      diagnosis,
      triage: triageIncident(
        buildIncidentWorkerRequest(
          validateIncidentWorkerInput({
            incidentId: "inc-plan-001",
            alertType: DEFAULT_ALERT_TYPE,
            service: DEFAULT_INCIDENT_SERVICE,
            message: DEFAULT_INCIDENT_MESSAGE,
          }),
        ),
      ),
    });
    const plan = planRemediation({ diagnosis, bundle, severity });
    expect(plan.action).toBe("rollback");
    expect(plan.target).toBe("dep-442");
    expect(plan.requiresApproval).toBe(true);
    const summary = buildApprovalSummary({
      request: buildIncidentWorkerRequest(
        validateIncidentWorkerInput({
          incidentId: "inc-plan-001",
          alertType: DEFAULT_ALERT_TYPE,
          service: DEFAULT_INCIDENT_SERVICE,
          message: DEFAULT_INCIDENT_MESSAGE,
        }),
      ),
      severity,
      diagnosis,
      evidence,
      plan,
    });
    expect(summary.proposedRemediation).toContain("rollback");
    expect(summary.expectedRecoverySignal).toMatch(/error rate/i);
  });

  it("executes idempotent rollback and restart remediation tools", async () => {
    resetIncidentFixtures();
    const actionId = "inc-idem-rollback";
    const first = rollbackDeployment({
      service: DEFAULT_INCIDENT_SERVICE,
      deploymentId: "dep-442",
      actionId,
    });
    const second = rollbackDeployment({
      service: DEFAULT_INCIDENT_SERVICE,
      deploymentId: "dep-442",
      actionId,
    });
    expect(first.status).toBe("completed");
    expect(second.status).toBe("already-completed");
    resetIncidentFixtures();
    const restartId = "inc-idem-restart";
    const r1 = restartService({ service: DEFAULT_INCIDENT_SERVICE, actionId: restartId });
    const r2 = restartService({ service: DEFAULT_INCIDENT_SERVICE, actionId: restartId });
    expect(r1.status).toBe("completed");
    expect(r2.status).toBe("already-completed");
    resetIncidentFixtures();
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const viaMcp = await executeRollbackDeployment({
      service: DEFAULT_INCIDENT_SERVICE,
      deploymentId: "dep-442",
      actionId: "mcp-rollback-001",
    });
    write.mockRestore();
    expect(viaMcp.result.status).toBe("completed");
  });

  it("verifies successful recovery after rollback", () => {
    resetIncidentFixtures();
    rollbackDeployment({
      service: DEFAULT_INCIDENT_SERVICE,
      deploymentId: "dep-442",
      actionId: "verify-rollback-001",
    });
    const bundle = loadDemoBundle();
    const recovery = verifyRecovery(DEFAULT_INCIDENT_SERVICE, bundle);
    expect(recovery.recovered).toBe(true);
    expect(recovery.checks.every((check) => check.passed)).toBe(true);
    expect(serviceRecoveredAfterRemediation(DEFAULT_INCIDENT_SERVICE)).toBe(true);
  });

  it("represents failed recovery after restart-only remediation", () => {
    resetIncidentFixtures();
    restartService({ service: DEFAULT_INCIDENT_SERVICE, actionId: "verify-restart-fail" });
    const bundle = loadDemoBundle();
    const recovery = verifyRecovery(DEFAULT_INCIDENT_SERVICE, bundle);
    expect(recovery.recovered).toBe(false);
    expect(recovery.remainingIssues.length).toBeGreaterThan(0);
    const escalation = createEscalation({
      severity: "sev2",
      rationale: "demo",
      userImpact: "demo",
      durationMinutes: 10,
    });
    expect(escalation.nextSteps.length).toBeGreaterThan(0);
  });

  it("renders incident report markdown with required sections", () => {
    resetIncidentFixtures();
    const request = buildIncidentWorkerRequest(
      validateIncidentWorkerInput({
        incidentId: "inc-report-001",
        alertType: DEFAULT_ALERT_TYPE,
        service: DEFAULT_INCIDENT_SERVICE,
        message: DEFAULT_INCIDENT_MESSAGE,
      }),
    );
    const bundle = loadDemoBundle();
    const evidence = buildEvidence(bundle);
    const diagnosis = diagnoseIncident(evidence);
    const triage = triageIncident(request);
    const severity = assessSeverity({ request, bundle, diagnosis, triage });
    const plan = planRemediation({ diagnosis, bundle, severity });
    const markdown = renderIncidentReportMarkdown({
      request,
      triage,
      evidence,
      diagnosis,
      severity,
      plan,
      approvalDecision: { decision: "APPROVED", comment: "Approved for demo report." },
      remediation: { actionId: "a1", status: "completed", details: "rolled back" },
      recovery: verifyRecovery(DEFAULT_INCIDENT_SERVICE, bundle),
    });
    expect(markdown).toContain("# Incident Report");
    expect(markdown).toContain("## Recovery Verification");
    expect(markdown).toContain("## Competing Hypotheses");
    expect(markdown).toContain("cause-payments-outage");
  });

  it("defines workflow structure with approval before execute and recovery branch", () => {
    const definition = buildWorkflowDefinition("agv_demo" as never);
    const parsed = workflowDefinitionSchema.parse(definition);
    expect(parsed.nodes.some((node) => node.key === APPROVAL_NODE && node.type === "APPROVAL")).toBe(true);
    expect(parsed.nodes.some((node) => node.key === BRANCH_NODE && node.type === "BRANCH")).toBe(true);
    const approvalIndex = WORKFLOW_LINEAR_STAGE_ORDER.indexOf(APPROVAL_NODE);
    const executeIndex = WORKFLOW_LINEAR_STAGE_ORDER.indexOf(EXECUTE_NODE);
    expect(approvalIndex).toBeLessThan(executeIndex);
    const edgeToExecute = parsed.edges.find((edge) => edge.from === APPROVAL_NODE && edge.to === EXECUTE_NODE);
    expect(edgeToExecute).toBeDefined();
    const branchNode = parsed.nodes.find((node) => node.key === BRANCH_NODE);
    expect(branchNode?.type).toBe("BRANCH");
    if (branchNode?.type === "BRANCH") {
      expect(branchNode.selector).toBe("/recoveryRoute");
      expect(branchNode.cases.some((item) => item.equals === "recovered" && item.to === REPORT_NODE)).toBe(true);
    }
    expect(parsed.edges.some((edge) => edge.from === COLLECT_NODE)).toBe(true);
    expect(parsed.edges.some((edge) => edge.from === PLAN_NODE && edge.to === APPROVAL_NODE)).toBe(true);
  });

  it("builds agent manifest with incident tool bindings", () => {
    const manifest = buildIncidentResponseAgentManifest("http://127.0.0.1:8804/runtime", {
      health: "tv_health" as never,
      logs: "tv_logs" as never,
      deployments: "tv_deployments" as never,
      dependencies: "tv_dependencies" as never,
      rollback: "tv_rollback" as never,
      restart: "tv_restart" as never,
    });
    expect(manifest.runtime.type).toBe("REMOTE_HTTP");
    expect(manifest.capabilities.tools).toContain(HEALTH_TOOL_BINDING);
    expect(manifest.capabilities.tools).toContain(DEPENDENCIES_TOOL_BINDING);
    expect(manifest.capabilities.tools).toContain(ROLLBACK_TOOL_BINDING);
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key|authorization|bearer/i);
  });

  it("documents that rejected approval should block side effects at runtime", () => {
    expect(PLAN_NODE).toBe("plan-remediation");
    expect(EXECUTE_NODE).toBe("execute-remediation");
    expect(buildWorkflowDefinition("agv_demo" as never).edges).not.toContainEqual({
      from: APPROVAL_NODE,
      to: REPORT_NODE,
    });
  });
});
