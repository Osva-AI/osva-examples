import type { AgentVersionId, WorkflowDefinitionV3 } from "@osva-ai/contracts";

export const CLASSIFY_NODE = "classify-intent";
export const LOOKUP_NODE = "lookup-context";
export const POLICY_NODE = "evaluate-policy";
export const RESOLUTION_NODE = "plan-resolution";
export const BRANCH_NODE = "route-decision";
export const APPROVAL_NODE = "human-approval";
export const ACTION_NODE = "execute-action";
export const ESCALATION_NODE = "create-escalation";
export const RESPONSE_NODE = "write-response";

/** Linear stages before conditional routing (used in tests and observability docs). */
export const WORKFLOW_LINEAR_STAGE_ORDER = [
  CLASSIFY_NODE,
  LOOKUP_NODE,
  POLICY_NODE,
  RESOLUTION_NODE,
  BRANCH_NODE,
] as const;

export function buildWorkflowDefinition(agentVersionId: AgentVersionId) {
  return {
    schemaVersion: "3",
    nodes: [
      { key: CLASSIFY_NODE, type: "AGENT", agentVersionId },
      { key: LOOKUP_NODE, type: "AGENT", agentVersionId },
      { key: POLICY_NODE, type: "AGENT", agentVersionId },
      { key: RESOLUTION_NODE, type: "AGENT", agentVersionId },
      {
        key: BRANCH_NODE,
        type: "BRANCH",
        selector: "/route",
        cases: [
          { equals: "reply-only", to: RESPONSE_NODE },
          { equals: "auto-action", to: ACTION_NODE },
          { equals: "needs-approval", to: APPROVAL_NODE },
          { equals: "escalate", to: ESCALATION_NODE },
        ],
        defaultTo: RESPONSE_NODE,
      },
      {
        key: APPROVAL_NODE,
        type: "APPROVAL",
        title: "Approve sensitive support action",
        description:
          "Review customer, order, requested action, amount, and demo policy reasoning before executing refund/cancel tools. " +
          "OSVA 1.0 approvals support approve/reject only — modify the action outside the platform if needed.",
      },
      { key: ACTION_NODE, type: "AGENT", agentVersionId },
      { key: ESCALATION_NODE, type: "AGENT", agentVersionId },
      { key: RESPONSE_NODE, type: "AGENT", agentVersionId },
    ],
    edges: [
      { from: CLASSIFY_NODE, to: LOOKUP_NODE },
      { from: LOOKUP_NODE, to: POLICY_NODE },
      { from: POLICY_NODE, to: RESOLUTION_NODE },
      { from: RESOLUTION_NODE, to: BRANCH_NODE },
      { from: APPROVAL_NODE, to: ACTION_NODE },
      { from: ACTION_NODE, to: RESPONSE_NODE },
      { from: ESCALATION_NODE, to: RESPONSE_NODE },
    ],
  } satisfies WorkflowDefinitionV3;
}
