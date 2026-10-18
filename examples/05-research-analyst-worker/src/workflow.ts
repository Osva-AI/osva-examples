import type { AgentVersionId, WorkflowDefinitionV3 } from "@osva-ai/contracts";

export const PLAN_NODE = "plan-research";
export const COLLECT_NODE = "collect-sources";
export const EXTRACT_NODE = "extract-evidence";
export const ANALYZE_NODE = "analyze-themes";
export const REVIEW_NODE = "review-evidence";
export const APPROVAL_NODE = "human-approval";
export const REPORT_NODE = "write-report";

export const WORKFLOW_STAGE_ORDER = [
  PLAN_NODE,
  COLLECT_NODE,
  EXTRACT_NODE,
  ANALYZE_NODE,
  REVIEW_NODE,
  APPROVAL_NODE,
  REPORT_NODE,
] as const;

export function buildWorkflowDefinition(agentVersionId: AgentVersionId) {
  return {
    schemaVersion: "3",
    nodes: [
      { key: PLAN_NODE, type: "AGENT", agentVersionId },
      { key: COLLECT_NODE, type: "AGENT", agentVersionId },
      { key: EXTRACT_NODE, type: "AGENT", agentVersionId },
      { key: ANALYZE_NODE, type: "AGENT", agentVersionId },
      { key: REVIEW_NODE, type: "AGENT", agentVersionId },
      {
        key: APPROVAL_NODE,
        type: "APPROVAL",
        title: "Approve research synthesis before publication",
        description:
          "Review themes, conflicts, and evidence gaps from the fixture-backed research run. " +
          "OSVA 1.0 approvals support approve/reject only — edit findings outside the platform if needed.",
      },
      { key: REPORT_NODE, type: "AGENT", agentVersionId },
    ],
    edges: [
      { from: PLAN_NODE, to: COLLECT_NODE },
      { from: COLLECT_NODE, to: EXTRACT_NODE },
      { from: EXTRACT_NODE, to: ANALYZE_NODE },
      { from: ANALYZE_NODE, to: REVIEW_NODE },
      { from: REVIEW_NODE, to: APPROVAL_NODE },
      { from: APPROVAL_NODE, to: REPORT_NODE },
    ],
  } satisfies WorkflowDefinitionV3;
}
