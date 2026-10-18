import type { AgentVersionId, WorkflowDefinitionV3 } from "@osva-ai/contracts";

export const COLLECT_NODE = "collect-evidence";
export const CLUSTER_NODE = "cluster-problems";
export const ANALYZE_NODE = "analyze-opportunities";
export const PRIORITIZE_NODE = "prioritize";
export const DRAFT_NODE = "draft-product-brief";
export const REVIEW_NODE = "review-brief";
export const APPROVAL_NODE = "human-approval";
export const REPORT_NODE = "publish-product-brief";

export const WORKFLOW_STAGE_ORDER = [
  COLLECT_NODE,
  CLUSTER_NODE,
  ANALYZE_NODE,
  PRIORITIZE_NODE,
  DRAFT_NODE,
  REVIEW_NODE,
  APPROVAL_NODE,
  REPORT_NODE,
] as const;

export function buildWorkflowDefinition(agentVersionId: AgentVersionId) {
  return {
    schemaVersion: "3",
    nodes: [
      { key: COLLECT_NODE, type: "AGENT", agentVersionId },
      { key: CLUSTER_NODE, type: "AGENT", agentVersionId },
      { key: ANALYZE_NODE, type: "AGENT", agentVersionId },
      { key: PRIORITIZE_NODE, type: "AGENT", agentVersionId },
      { key: DRAFT_NODE, type: "AGENT", agentVersionId },
      { key: REVIEW_NODE, type: "AGENT", agentVersionId },
      {
        key: APPROVAL_NODE,
        type: "APPROVAL",
        title: "Approve product brief publication",
        description:
          "Review prioritized opportunity, evidence, proposed approach, and reviewer concerns. " +
          "OSVA 1.0 approvals support approve/reject only — edit the brief outside the platform if needed.",
      },
      { key: REPORT_NODE, type: "AGENT", agentVersionId },
    ],
    edges: [
      { from: COLLECT_NODE, to: CLUSTER_NODE },
      { from: CLUSTER_NODE, to: ANALYZE_NODE },
      { from: ANALYZE_NODE, to: PRIORITIZE_NODE },
      { from: PRIORITIZE_NODE, to: DRAFT_NODE },
      { from: DRAFT_NODE, to: REVIEW_NODE },
      { from: REVIEW_NODE, to: APPROVAL_NODE },
      { from: APPROVAL_NODE, to: REPORT_NODE },
    ],
  } satisfies WorkflowDefinitionV3;
}
