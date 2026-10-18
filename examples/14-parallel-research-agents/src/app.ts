import { randomUUID } from "node:crypto";

import type { AgentVersionId, AuthContextResourceV1, WorkflowRunResourceV1 } from "@osva-ai/contracts";
import { OsvaClient, OsvaHttpClient } from "@osva-ai/sdk";
import { optionalPositiveIntEnv, pollWithDeadline, requireEnv } from "@osva-examples/utils";

import { buildResearchRequest, DEFAULT_RESEARCH_QUESTION, validateResearchQuestion } from "./input.js";
import { buildParallelAgentVersionsForWorkflow, buildRouteAgentManifest, type RuntimeRoute } from "./manifest.js";
import { startParallelRuntimeServer } from "./server.js";
import {
  JOIN_NODE,
  MARKET_NODE,
  PARALLEL_BRANCH_NODES,
  PARALLEL_NODE,
  REPORT_NODE,
  buildWorkflowDefinition,
} from "./workflow.js";

const TERMINAL_WORKFLOWS = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

const ROUTE_NAMES: Record<RuntimeRoute, string> = {
  plan: "Parallel Research Plan",
  market: "Parallel Research Market Branch",
  competitor: "Parallel Research Competitor Branch",
  customer: "Parallel Research Customer Branch",
  synthesize: "Parallel Research Synthesis",
  report: "Parallel Research Report",
};

export interface ParallelResearchWorkflowResult {
  readonly workspaceId: string;
  readonly workflowRunId: string;
  readonly status: string;
  readonly branchNodes: readonly string[];
  readonly childRuns: readonly { readonly node: string; readonly runId: string }[];
  readonly output?: unknown;
}

export async function runParallelResearchWorkflow(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ParallelResearchWorkflowResult> {
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const runtimeBase = requireEnv("OSVA_PARALLEL_RUNTIME_BASE_URL", env);
  const host = env.OSVA_EXAMPLE_LISTEN_HOST?.trim() || "127.0.0.1";
  const runtimePort = optionalPositiveIntEnv("OSVA_EXAMPLE_RUNTIME_PORT", 8795, env);
  const timeoutMs = optionalPositiveIntEnv("OSVA_WORKFLOW_TIMEOUT_MS", 180_000, env);
  const intervalMs = optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env);
  const researchId = randomUUID();
  const suffix = researchId.slice(0, 8).toLowerCase();
  const question = validateResearchQuestion(env.OSVA_RESEARCH_QUESTION?.trim() || DEFAULT_RESEARCH_QUESTION);
  const request = buildResearchRequest(question, researchId);

  const runtime = await startParallelRuntimeServer({ host, port: runtimePort });
  const runtimeBaseUrl = runtimeBase.includes("://")
    ? runtimeBase.replace(/\/+$/, "")
    : `http://${host}:${String(runtimePort)}`;

  try {
    const client = new OsvaClient({ baseUrl, apiKey });
    const http = new OsvaHttpClient({ baseUrl, apiKey });
    const auth = await http.request<AuthContextResourceV1>({ method: "GET", path: "/v1/auth/context" });

    const agent = await client.agents.create({
      key: `examples-parallel-research-${suffix}`,
      name: `Examples Parallel Research ${suffix}`,
    });

    const versionIds = {} as Record<RuntimeRoute, AgentVersionId>;
    for (const route of Object.keys(ROUTE_NAMES) as RuntimeRoute[]) {
      const version = await client.agents.createVersion(agent.id, {
        manifest: buildRouteAgentManifest(runtimeBaseUrl, route, `${ROUTE_NAMES[route]} ${suffix}`),
      });
      versionIds[route] = version.id as AgentVersionId;
    }

    const workflow = await client.workflows.create({
      key: `examples-parallel-research-flow-${suffix}`,
      name: `Examples Parallel Research Flow ${suffix}`,
    });
    const workflowVersion = await client.workflows.createVersion(workflow.id, {
      definition: buildWorkflowDefinition(buildParallelAgentVersionsForWorkflow(versionIds)),
    });

    const run = await client.workflowRuns.create({
      workflowVersionId: workflowVersion.id,
      input: { request: { researchId: request.researchId, question: request.question } },
    });

    const completed = await pollWithDeadline<WorkflowRunResourceV1>({
      description: `WorkflowRun ${run.id}`,
      read: () => client.workflowRuns.get(run.id),
      isDone: (value) => TERMINAL_WORKFLOWS.has(value.status),
      summarize: (value) =>
        `${value.status}; nodes=${value.nodeRuns.map((node) => `${node.workflowNodeKey}:${node.status}`).join(",")}`,
      timeoutMs,
      intervalMs,
    });

    const childRuns = completed.value.nodeRuns
      .filter((node) => node.childRunId !== undefined && PARALLEL_BRANCH_NODES.includes(node.workflowNodeKey as never))
      .map((node) => ({ node: node.workflowNodeKey, runId: node.childRunId as string }));

    return {
      workspaceId: auth.workspaceId,
      workflowRunId: completed.value.id,
      status: completed.value.status,
      branchNodes: [...PARALLEL_BRANCH_NODES],
      childRuns,
      ...(completed.value.output === undefined ? {} : { output: completed.value.output }),
    };
  } finally {
    await runtime.close();
  }
}

export function summarizeParallelWorkflowStructure(): {
  readonly parallelNode: string;
  readonly joinNode: string;
  readonly branchNodes: readonly string[];
} {
  return {
    parallelNode: "fan-out",
    joinNode: JOIN_NODE,
    branchNodes: PARALLEL_BRANCH_NODES,
  };
}

export { MARKET_NODE, PARALLEL_NODE, REPORT_NODE, buildWorkflowDefinition };
