import type { AgentVersionId, WorkflowDefinitionV3 } from "@osva-ai/contracts";

export const COLLECT_NODE = "collect-company-signals";
export const NORMALIZE_NODE = "normalize-signals";
export const DETECT_NODE = "detect-risks-opportunities";
export const PRIORITIZE_NODE = "prioritize-attention";
export const ACTIONS_NODE = "prepare-actions";
export const APPROVAL_NODE = "human-approval";
export const REPORT_NODE = "write-executive-brief";

export const WORKFLOW_STAGE_ORDER = [
  COLLECT_NODE,
  NORMALIZE_NODE,
  DETECT_NODE,
  PRIORITIZE_NODE,
  ACTIONS_NODE,
  APPROVAL_NODE,
  REPORT_NODE,
] as const;

export function buildWorkflowDefinition(agentVersionId: AgentVersionId) {
  return {
    schemaVersion: "3",
    nodes: [
      { key: COLLECT_NODE, type: "AGENT", agentVersionId },
      { key: NORMALIZE_NODE, type: "AGENT", agentVersionId },
      { key: DETECT_NODE, type: "AGENT", agentVersionId },
      { key: PRIORITIZE_NODE, type: "AGENT", agentVersionId },
      { key: ACTIONS_NODE, type: "AGENT", agentVersionId },
      {
        key: APPROVAL_NODE,
        type: "APPROVAL",
        title: "Approve executive brief publication",
        description:
          "Review top risks, opportunities, decisions, and recommended actions from the fixture-backed operating review. " +
          "OSVA 1.0 supports approve/reject only — no external actions execute in this example.",
      },
      { key: REPORT_NODE, type: "AGENT", agentVersionId },
    ],
    edges: [
      { from: COLLECT_NODE, to: NORMALIZE_NODE },
      { from: NORMALIZE_NODE, to: DETECT_NODE },
      { from: DETECT_NODE, to: PRIORITIZE_NODE },
      { from: PRIORITIZE_NODE, to: ACTIONS_NODE },
      { from: ACTIONS_NODE, to: APPROVAL_NODE },
      { from: APPROVAL_NODE, to: REPORT_NODE },
    ],
  } satisfies WorkflowDefinitionV3;
}
