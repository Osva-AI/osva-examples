import type { AgentVersionId, WorkflowDefinitionV3 } from "@osva-ai/contracts";

export const COLLECT_NODE = "collect-metrics";
export const ANALYZE_FUNNEL_NODE = "analyze-funnel";
export const DETECT_NODE = "detect-opportunities";
export const GENERATE_NODE = "generate-experiments";
export const PRIORITIZE_NODE = "prioritize-experiments";
export const APPROVAL_NODE = "human-approval";
export const REPORT_NODE = "write-growth-brief";

export const WORKFLOW_STAGE_ORDER = [
  COLLECT_NODE,
  ANALYZE_FUNNEL_NODE,
  DETECT_NODE,
  GENERATE_NODE,
  PRIORITIZE_NODE,
  APPROVAL_NODE,
  REPORT_NODE,
] as const;

export function buildWorkflowDefinition(agentVersionId: AgentVersionId) {
  return {
    schemaVersion: "3",
    nodes: [
      { key: COLLECT_NODE, type: "AGENT", agentVersionId },
      { key: ANALYZE_FUNNEL_NODE, type: "AGENT", agentVersionId },
      { key: DETECT_NODE, type: "AGENT", agentVersionId },
      { key: GENERATE_NODE, type: "AGENT", agentVersionId },
      { key: PRIORITIZE_NODE, type: "AGENT", agentVersionId },
      {
        key: APPROVAL_NODE,
        type: "APPROVAL",
        title: "Approve growth experiment brief",
        description:
          "Review prioritized findings, opportunities, and experiments from the fixture-backed growth analysis. " +
          "OSVA 1.0 approvals support approve/reject only — adjust the experiment plan outside the platform if needed.",
      },
      { key: REPORT_NODE, type: "AGENT", agentVersionId },
    ],
    edges: [
      { from: COLLECT_NODE, to: ANALYZE_FUNNEL_NODE },
      { from: ANALYZE_FUNNEL_NODE, to: DETECT_NODE },
      { from: DETECT_NODE, to: GENERATE_NODE },
      { from: GENERATE_NODE, to: PRIORITIZE_NODE },
      { from: PRIORITIZE_NODE, to: APPROVAL_NODE },
      { from: APPROVAL_NODE, to: REPORT_NODE },
    ],
  } satisfies WorkflowDefinitionV3;
}
