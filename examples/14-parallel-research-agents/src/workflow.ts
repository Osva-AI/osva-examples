import type { AgentVersionId, WorkflowDefinitionV3 } from "@osva-ai/contracts";

export const PLAN_NODE = "plan-research";
export const PARALLEL_NODE = "fan-out";
export const MARKET_NODE = "research-market";
export const COMPETITOR_NODE = "research-competitor";
export const CUSTOMER_NODE = "research-customer";
export const JOIN_NODE = "join-branches";
export const SYNTHESIS_NODE = "synthesize-report";
export const REPORT_NODE = "write-report";

export const PARALLEL_BRANCH_NODES = [MARKET_NODE, COMPETITOR_NODE, CUSTOMER_NODE] as const;

export interface ParallelResearchAgentVersions {
  readonly plan: AgentVersionId;
  readonly market: AgentVersionId;
  readonly competitor: AgentVersionId;
  readonly customer: AgentVersionId;
  readonly synthesis: AgentVersionId;
  readonly report: AgentVersionId;
}

export function buildWorkflowDefinition(versions: ParallelResearchAgentVersions) {
  return {
    schemaVersion: "3",
    nodes: [
      { key: PLAN_NODE, type: "AGENT", agentVersionId: versions.plan },
      { key: PARALLEL_NODE, type: "PARALLEL" },
      { key: MARKET_NODE, type: "AGENT", agentVersionId: versions.market },
      { key: COMPETITOR_NODE, type: "AGENT", agentVersionId: versions.competitor },
      { key: CUSTOMER_NODE, type: "AGENT", agentVersionId: versions.customer },
      { key: JOIN_NODE, type: "JOIN" },
      { key: SYNTHESIS_NODE, type: "AGENT", agentVersionId: versions.synthesis },
      { key: REPORT_NODE, type: "AGENT", agentVersionId: versions.report },
    ],
    edges: [
      { from: PLAN_NODE, to: PARALLEL_NODE },
      { from: PARALLEL_NODE, to: MARKET_NODE },
      { from: PARALLEL_NODE, to: COMPETITOR_NODE },
      { from: PARALLEL_NODE, to: CUSTOMER_NODE },
      { from: MARKET_NODE, to: JOIN_NODE },
      { from: COMPETITOR_NODE, to: JOIN_NODE },
      { from: CUSTOMER_NODE, to: JOIN_NODE },
      { from: JOIN_NODE, to: SYNTHESIS_NODE },
      { from: SYNTHESIS_NODE, to: REPORT_NODE },
    ],
  } satisfies WorkflowDefinitionV3;
}
