import type { AgentVersionId, WorkflowDefinitionV3 } from "@osva-ai/contracts";

export const EVENT_SOURCE = "osva-examples";
export const EVENT_TYPE = "review.delivery.ready";
export const APPROVAL_NODE = "human-approval";
export const WAIT_NODE = "delivery-wait";
export const REPORT_NODE = "report";

export function buildWorkflowDefinition(agentVersionId: AgentVersionId) {
  return {
    schemaVersion: "3",
    nodes: [
      { key: "research", type: "AGENT", agentVersionId },
      { key: "analysis", type: "AGENT", agentVersionId },
      {
        key: APPROVAL_NODE,
        type: "APPROVAL",
        title: "Approve the review before delivery",
        description: "A human must approve the deterministic analysis before the external event gate.",
      },
      {
        key: WAIT_NODE,
        type: "WAIT",
        wait: {
          kind: "EVENT",
          source: EVENT_SOURCE,
          eventType: EVENT_TYPE,
          correlation: { kind: "INPUT_POINTER", pointer: "/request/requestId" },
          timeoutMs: 60_000,
        },
      },
      { key: REPORT_NODE, type: "AGENT", agentVersionId },
    ],
    edges: [
      { from: "research", to: "analysis" },
      { from: "analysis", to: APPROVAL_NODE },
      { from: APPROVAL_NODE, to: WAIT_NODE },
      { from: WAIT_NODE, to: REPORT_NODE },
    ],
  } satisfies WorkflowDefinitionV3;
}
