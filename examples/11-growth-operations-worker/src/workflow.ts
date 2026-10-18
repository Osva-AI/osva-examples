import type { AgentVersionId, WorkflowDefinitionV3 } from "@osva-ai/contracts";

export const COLLECT_NODE = "collect-signals";
export const DIAGNOSE_NODE = "diagnose-growth";
export const CUSTOMER_NODE = "analyze-customer-signals";
export const RESEARCH_NODE = "research-context";
export const OPPORTUNITIES_NODE = "generate-opportunities";
export const CRITIC_NODE = "critic-review";
export const SELECT_NODE = "select-intervention";
export const BRANCH_NODE = "intervention-branch";
export const PREPARE_NODE = "prepare-action";
export const APPROVAL_NODE = "human-approval";
export const EXECUTE_NODE = "execute-action";
export const VERIFY_NODE = "verify-execution";
export const REPORT_NODE = "write-growth-operations-brief";

export const WORKFLOW_STAGE_ORDER = [
  COLLECT_NODE,
  DIAGNOSE_NODE,
  CUSTOMER_NODE,
  RESEARCH_NODE,
  OPPORTUNITIES_NODE,
  CRITIC_NODE,
  SELECT_NODE,
  BRANCH_NODE,
  PREPARE_NODE,
  APPROVAL_NODE,
  EXECUTE_NODE,
  VERIFY_NODE,
  REPORT_NODE,
] as const;

export function buildWorkflowDefinition(agentVersionId: AgentVersionId) {
  return {
    schemaVersion: "3",
    nodes: [
      { key: COLLECT_NODE, type: "AGENT", agentVersionId },
      { key: DIAGNOSE_NODE, type: "AGENT", agentVersionId },
      { key: CUSTOMER_NODE, type: "AGENT", agentVersionId },
      { key: RESEARCH_NODE, type: "AGENT", agentVersionId },
      { key: OPPORTUNITIES_NODE, type: "AGENT", agentVersionId },
      { key: CRITIC_NODE, type: "AGENT", agentVersionId },
      { key: SELECT_NODE, type: "AGENT", agentVersionId },
      {
        key: BRANCH_NODE,
        type: "BRANCH",
        selector: "/interventionRoute",
        cases: [
          { equals: "content-action", to: PREPARE_NODE },
          { equals: "campaign-action", to: PREPARE_NODE },
          { equals: "conversion-action", to: PREPARE_NODE },
          { equals: "retention-action", to: PREPARE_NODE },
          { equals: "monitor-only", to: PREPARE_NODE },
        ],
        defaultTo: PREPARE_NODE,
      },
      { key: PREPARE_NODE, type: "AGENT", agentVersionId },
      {
        key: APPROVAL_NODE,
        type: "APPROVAL",
        title: "Approve growth operations intervention",
        description:
          "Review diagnosed constraint, critic findings, selected intervention, and proposed demo action before execution. " +
          "OSVA 1.0 supports approve/reject only — no real ad spend or commerce changes occur in this example.",
      },
      { key: EXECUTE_NODE, type: "AGENT", agentVersionId },
      { key: VERIFY_NODE, type: "AGENT", agentVersionId },
      { key: REPORT_NODE, type: "AGENT", agentVersionId },
    ],
    edges: [
      { from: COLLECT_NODE, to: DIAGNOSE_NODE },
      { from: DIAGNOSE_NODE, to: CUSTOMER_NODE },
      { from: CUSTOMER_NODE, to: RESEARCH_NODE },
      { from: RESEARCH_NODE, to: OPPORTUNITIES_NODE },
      { from: OPPORTUNITIES_NODE, to: CRITIC_NODE },
      { from: CRITIC_NODE, to: SELECT_NODE },
      { from: SELECT_NODE, to: BRANCH_NODE },
      { from: PREPARE_NODE, to: APPROVAL_NODE },
      { from: APPROVAL_NODE, to: EXECUTE_NODE },
      { from: EXECUTE_NODE, to: VERIFY_NODE },
      { from: VERIFY_NODE, to: REPORT_NODE },
    ],
  } satisfies WorkflowDefinitionV3;
}
