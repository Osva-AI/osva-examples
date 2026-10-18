import type { AgentVersionId } from "@osva-ai/contracts";

import type { ParallelResearchAgentVersions } from "./workflow.js";

export type RuntimeRoute = "plan" | "market" | "competitor" | "customer" | "synthesize" | "report";

export function runtimeEndpoint(baseUrl: string, route: RuntimeRoute): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/execute/${route}`;
}

export function buildRouteAgentManifest(baseUrl: string, route: RuntimeRoute, name: string) {
  return {
    schemaVersion: "1" as const,
    key: `parallel-research-${route}`,
    name,
    runtime: {
      type: "REMOTE_HTTP" as const,
      protocolVersion: "1" as const,
      endpoint: runtimeEndpoint(baseUrl, route),
      timeoutMs: 45_000,
    },
    input: { schema: { type: "object" } },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 45_000, maxAttempts: 1 },
    capabilities: { model: false, tools: [] as string[] },
  };
}

export function buildParallelAgentVersionsForWorkflow(
  ids: Record<RuntimeRoute, AgentVersionId>,
): ParallelResearchAgentVersions {
  return {
    plan: ids.plan,
    market: ids.market,
    competitor: ids.competitor,
    customer: ids.customer,
    synthesis: ids.synthesize,
    report: ids.report,
  };
}
