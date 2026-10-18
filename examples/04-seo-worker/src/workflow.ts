import type { AgentVersionId, WorkflowDefinitionV3 } from "@osva-ai/contracts";

export const INSPECT_NODE = "inspect-page";
export const ANALYZE_NODE = "analyze-seo";
export const APPROVAL_NODE = "human-approval";
export const REPORT_NODE = "generate-report";

export function buildWorkflowDefinition(agentVersionId: AgentVersionId) {
  return {
    schemaVersion: "3",
    nodes: [
      { key: INSPECT_NODE, type: "AGENT", agentVersionId },
      { key: ANALYZE_NODE, type: "AGENT", agentVersionId },
      {
        key: APPROVAL_NODE,
        type: "APPROVAL",
        title: "Approve SEO audit recommendations",
        description:
          "Review the prioritized findings before the worker publishes the Markdown SEO audit artifact. " +
          "Stable OSVA 1.0 approvals support approve/reject only; edit findings in a future integration if needed.",
      },
      { key: REPORT_NODE, type: "AGENT", agentVersionId },
    ],
    edges: [
      { from: INSPECT_NODE, to: ANALYZE_NODE },
      { from: ANALYZE_NODE, to: APPROVAL_NODE },
      { from: APPROVAL_NODE, to: REPORT_NODE },
    ],
  } satisfies WorkflowDefinitionV3;
}
