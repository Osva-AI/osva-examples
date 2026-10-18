import type { AgentVersionId, WorkflowDefinitionV3 } from "@osva-ai/contracts";

export const TRIAGE_NODE = "triage";
export const COLLECT_NODE = "collect-diagnostics";
export const DIAGNOSE_NODE = "diagnose";
export const SEVERITY_NODE = "assess-severity";
export const PLAN_NODE = "plan-remediation";
export const APPROVAL_NODE = "human-approval";
export const EXECUTE_NODE = "execute-remediation";
export const VERIFY_NODE = "verify-recovery";
export const BRANCH_NODE = "recovery-branch";
export const REPORT_NODE = "write-incident-report";
export const ESCALATE_NODE = "escalate-incident";

export const WORKFLOW_LINEAR_STAGE_ORDER = [
  TRIAGE_NODE,
  COLLECT_NODE,
  DIAGNOSE_NODE,
  SEVERITY_NODE,
  PLAN_NODE,
  APPROVAL_NODE,
  EXECUTE_NODE,
  VERIFY_NODE,
  BRANCH_NODE,
] as const;

export function buildWorkflowDefinition(agentVersionId: AgentVersionId) {
  return {
    schemaVersion: "3",
    nodes: [
      { key: TRIAGE_NODE, type: "AGENT", agentVersionId },
      { key: COLLECT_NODE, type: "AGENT", agentVersionId },
      { key: DIAGNOSE_NODE, type: "AGENT", agentVersionId },
      { key: SEVERITY_NODE, type: "AGENT", agentVersionId },
      { key: PLAN_NODE, type: "AGENT", agentVersionId },
      {
        key: APPROVAL_NODE,
        type: "APPROVAL",
        title: "Approve incident remediation",
        description:
          "Review severity, diagnosis, evidence, and proposed rollback/restart before any state-changing tool runs. " +
          "OSVA 1.0 supports approve/reject only.",
      },
      { key: EXECUTE_NODE, type: "AGENT", agentVersionId },
      { key: VERIFY_NODE, type: "AGENT", agentVersionId },
      {
        key: BRANCH_NODE,
        type: "BRANCH",
        selector: "/recoveryRoute",
        cases: [
          { equals: "recovered", to: REPORT_NODE },
          { equals: "unresolved", to: ESCALATE_NODE },
        ],
        defaultTo: ESCALATE_NODE,
      },
      { key: ESCALATE_NODE, type: "AGENT", agentVersionId },
      { key: REPORT_NODE, type: "AGENT", agentVersionId },
    ],
    edges: [
      { from: TRIAGE_NODE, to: COLLECT_NODE },
      { from: COLLECT_NODE, to: DIAGNOSE_NODE },
      { from: DIAGNOSE_NODE, to: SEVERITY_NODE },
      { from: SEVERITY_NODE, to: PLAN_NODE },
      { from: PLAN_NODE, to: APPROVAL_NODE },
      { from: APPROVAL_NODE, to: EXECUTE_NODE },
      { from: EXECUTE_NODE, to: VERIFY_NODE },
      { from: VERIFY_NODE, to: BRANCH_NODE },
      { from: ESCALATE_NODE, to: REPORT_NODE },
    ],
  } satisfies WorkflowDefinitionV3;
}
