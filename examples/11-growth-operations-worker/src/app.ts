import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import type {
  AgentVersionId,
  ApprovalRequestId,
  ArtifactId,
  AuthContextResourceV1,
  ConnectorResourceV1,
  ConnectorVersionResourceV1,
  DiscoverConnectorToolsResponseV1,
  ImportMcpToolsResponseV1,
  JsonValue,
  RunAttemptId,
  RunId,
  ToolVersionId,
  WorkflowRunResourceV1,
} from "@osva-ai/contracts";
import { OsvaClient, OsvaHttpClient } from "@osva-ai/sdk";
import { optionalPositiveIntEnv, pollWithDeadline, requireEnv } from "@osva-examples/utils";

import {
  DEFAULT_BUSINESS_ID,
  DEFAULT_GROWTH_OBJECTIVE,
  buildGrowthOpsWorkerRequest,
  validateGrowthOpsWorkerInput,
} from "./input.js";
import { buildGrowthOperationsAgentManifest } from "./runtime.js";
import { startGrowthOperationsServices } from "./services.js";
import { COLLECT_NODE, PREPARE_NODE, REPORT_NODE, buildWorkflowDefinition } from "./workflow.js";

const TERMINAL_WORKFLOWS = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

const REMOTE_TOOL_NAMES = [
  "get_commerce_metrics",
  "get_funnel_metrics",
  "get_campaign_metrics",
  "get_customer_signals",
  "get_content_signals",
  "get_inventory_or_product_context",
  "execute_demo_action",
] as const;

interface RunStepList {
  readonly steps: readonly {
    readonly id: string;
    readonly kind: "MODEL" | "TOOL" | "MEMORY" | "KNOWLEDGE";
    readonly bindingName?: string;
    readonly status: "RUNNING" | "SUCCEEDED" | "FAILED";
    readonly errorCode?: string;
  }[];
}

export interface GrowthOperationsWorkflowResult {
  readonly workspaceId: string;
  readonly workflowRunId: string;
  readonly approvalRequestId: string;
  readonly status: string;
  readonly artifactId: string;
  readonly artifactPath: string;
  readonly interventionRoute: string;
  readonly childRuns: readonly {
    readonly node: string;
    readonly runId: string;
    readonly attemptId?: string;
    readonly steps: RunStepList["steps"];
  }[];
}

export async function runGrowthOperationsWorkflow(
  env: NodeJS.ProcessEnv = process.env,
): Promise<GrowthOperationsWorkflowResult> {
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const connectorUrl = requireEnv("OSVA_GROWTH_OPS_MCP_CONNECTOR_URL", env);
  const runtimeUrl = requireEnv("OSVA_GROWTH_OPS_RUNTIME_URL", env);
  const host = env.OSVA_EXAMPLE_LISTEN_HOST?.trim() || "127.0.0.1";
  const mcpPort = optionalPositiveIntEnv("OSVA_EXAMPLE_MCP_PORT", 8805, env);
  const runtimePort = optionalPositiveIntEnv("OSVA_EXAMPLE_RUNTIME_PORT", 8806, env);
  const timeoutMs = optionalPositiveIntEnv("OSVA_WORKFLOW_TIMEOUT_MS", 180_000, env);
  const intervalMs = optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env);
  const outputDir = path.resolve(env.OSVA_ARTIFACT_OUTPUT_DIR?.trim() || "output");
  const runId = randomUUID();
  const suffix = runId.slice(0, 8).toLowerCase();

  const businessId = env.OSVA_GROWTH_OPS_BUSINESS_ID?.trim() || DEFAULT_BUSINESS_ID;
  const objective = env.OSVA_GROWTH_OPS_OBJECTIVE?.trim() || DEFAULT_GROWTH_OBJECTIVE;
  const context = env.OSVA_GROWTH_OPS_CONTEXT?.trim();
  const validated = validateGrowthOpsWorkerInput({
    businessId,
    objective,
    ...(context === undefined || context.length === 0 ? {} : { context }),
  });
  const request = buildGrowthOpsWorkerRequest(validated, runId);

  const services = await startGrowthOperationsServices({ host, mcpPort, runtimePort });
  try {
    const client = new OsvaClient({ baseUrl, apiKey });
    const http = new OsvaHttpClient({ baseUrl, apiKey });
    const auth = await http.request<AuthContextResourceV1>({ method: "GET", path: "/v1/auth/context" });

    const connector = await http.request<ConnectorResourceV1>({
      method: "POST",
      path: "/v1/connectors",
      body: {
        key: `examples-growth-ops-${suffix}`,
        name: `Examples Growth Ops ${suffix}`,
        description: "Fixture-backed growth operations data and demo actions.",
      },
    });
    const connectorVersion = await http.request<ConnectorVersionResourceV1>({
      method: "POST",
      path: `/v1/connectors/${encodeURIComponent(connector.id)}/versions`,
      body: {
        kind: "MCP",
        transport: "STREAMABLE_HTTP",
        transportConfig: { endpointUrl: connectorUrl },
      },
    });
    const discovery = await http.request<DiscoverConnectorToolsResponseV1>({
      method: "POST",
      path:
        `/v1/connectors/${encodeURIComponent(connector.id)}/versions/` +
        `${encodeURIComponent(connectorVersion.id)}/discover`,
    });
    const toolVersionIds = await importGrowthOpsTools(http, discovery, connectorVersion.id, suffix);

    const agent = await client.agents.create({
      key: `examples-growth-operations-${suffix}`,
      name: `Examples Growth Operations ${suffix}`,
    });
    const agentVersion = await client.agents.createVersion(agent.id, {
      manifest: buildGrowthOperationsAgentManifest(runtimeUrl, toolVersionIds),
    });
    const workflow = await client.workflows.create({
      key: `examples-growth-operations-${suffix}`,
      name: `Examples Growth Operations ${suffix}`,
      description: "Multi-stage growth ops workflow with critic, routing, approval, and brief artifact.",
    });
    const workflowVersion = await client.workflows.createVersion(workflow.id, {
      definition: buildWorkflowDefinition(agentVersion.id as AgentVersionId),
    });
    const started = await client.workflowRuns.create({
      workflowVersionId: workflowVersion.id,
      input: { request: { ...request } },
    });

    const awaitingApproval = await waitForWorkflow(
      client,
      started.id,
      (run) => run.approvalRequests.some((item) => item.status === "PENDING") || TERMINAL_WORKFLOWS.has(run.status),
      timeoutMs,
      intervalMs,
      "human approval",
    );
    assertWorkflowNotFailed(awaitingApproval.value);

    const prepareNode = awaitingApproval.value.nodeRuns.find((node) => node.workflowNodeKey === PREPARE_NODE);
    if (prepareNode?.status !== "SUCCEEDED") {
      throw new Error(`Expected ${PREPARE_NODE} to complete before approval.`);
    }

    const approval = awaitingApproval.value.approvalRequests.find((item) => item.status === "PENDING");
    if (approval === undefined) {
      throw new Error("Workflow never exposed a pending approval.");
    }
    const approvalDecision = await getApprovalDecision(approval.id, env);
    await client.approvals.decide(approval.id as ApprovalRequestId, {
      decision: approvalDecision,
      comment:
        approvalDecision === "APPROVED"
          ? "Approved growth operations action in osva-examples."
          : "Rejected growth operations action in osva-examples.",
    });
    if (approvalDecision === "REJECTED") {
      throw new Error("The operator rejected the action; execute_demo_action should not have run.");
    }

    const completed = await waitForWorkflow(
      client,
      started.id,
      (run) => TERMINAL_WORKFLOWS.has(run.status),
      timeoutMs,
      intervalMs,
      "workflow completion",
    );
    assertWorkflowSucceeded(completed.value);

    const reportNode = completed.value.nodeRuns.find((node) => node.workflowNodeKey === REPORT_NODE);
    const collectNode = completed.value.nodeRuns.find((node) => node.workflowNodeKey === COLLECT_NODE);
    if (collectNode?.status !== "SUCCEEDED") {
      throw new Error(`Expected ${COLLECT_NODE} to succeed.`);
    }
    if (reportNode?.status !== "SUCCEEDED") {
      throw new Error(`Expected ${REPORT_NODE} to succeed.`);
    }

    const artifactId = extractArtifactId(reportNode?.output ?? completed.value.output);
    const interventionRoute = extractInterventionRoute(reportNode?.output ?? completed.value.output);
    const artifact = await client.artifacts.get(artifactId);
    const download = await client.artifacts.download(artifactId);
    if (download.body === null) throw new Error("Artifact download returned no response body.");
    const bytes = new Uint8Array(await new Response(download.body).arrayBuffer());
    await mkdir(outputDir, { recursive: true });
    const artifactPath = path.join(outputDir, safeFilename(artifact.name));
    await writeFile(artifactPath, bytes);

    const childRuns = await collectChildRunActivity(client, http, completed.value);
    return {
      workspaceId: auth.workspaceId,
      workflowRunId: completed.value.id,
      approvalRequestId: approval.id,
      status: completed.value.status,
      artifactId,
      artifactPath,
      interventionRoute,
      childRuns,
    };
  } finally {
    await services.close();
  }
}

async function importGrowthOpsTools(
  http: OsvaHttpClient,
  discovery: DiscoverConnectorToolsResponseV1,
  connectorVersionId: string,
  suffix: string,
) {
  const imports = REMOTE_TOOL_NAMES.map((remoteToolName) => {
    const discovered = discovery.tools.find((tool) => tool.remoteToolName === remoteToolName);
    if (discovered === undefined) {
      throw new Error(`MCP discovery did not return ${remoteToolName}.`);
    }
    return {
      remoteToolName: discovered.remoteToolName,
      toolKey: `examples-${remoteToolName}-${suffix}`,
      toolName: `Examples ${remoteToolName} ${suffix}`,
    };
  });
  const imported = await http.request<ImportMcpToolsResponseV1>({
    method: "POST",
    path: "/v1/connectors/import-mcp-tools",
    body: { connectorVersionId, tools: imports },
  });
  const byRemote = new Map(imported.imported.map((item) => [item.remoteToolName, item.toolVersionId as ToolVersionId]));
  const commerce = byRemote.get("get_commerce_metrics");
  const funnel = byRemote.get("get_funnel_metrics");
  const campaign = byRemote.get("get_campaign_metrics");
  const customer = byRemote.get("get_customer_signals");
  const content = byRemote.get("get_content_signals");
  const product = byRemote.get("get_inventory_or_product_context");
  const execute = byRemote.get("execute_demo_action");
  if (!commerce || !funnel || !campaign || !customer || !content || !product || !execute) {
    throw new Error("Growth ops tools were not imported.");
  }
  return { commerce, funnel, campaign, customer, content, product, execute };
}

async function getApprovalDecision(
  approvalRequestId: string,
  env: NodeJS.ProcessEnv,
): Promise<"APPROVED" | "REJECTED"> {
  if (env.OSVA_AUTO_APPROVE?.trim().toLowerCase() === "true") return "APPROVED";
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `Approval ${approvalRequestId} is waiting for a human. ` +
        "Run interactively, or set OSVA_AUTO_APPROVE=true only for a deliberate scripted demo.",
    );
  }
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await terminal.question(
      `Growth operations paused at approval ${approvalRequestId}. Approve execution? [y/N] `,
    );
    return /^y(?:es)?$/i.test(answer.trim()) ? "APPROVED" : "REJECTED";
  } finally {
    terminal.close();
  }
}

async function waitForWorkflow(
  client: OsvaClient,
  workflowRunId: WorkflowRunResourceV1["id"],
  isDone: (run: WorkflowRunResourceV1) => boolean,
  timeoutMs: number,
  intervalMs: number,
  description: string,
) {
  return pollWithDeadline<WorkflowRunResourceV1>({
    description,
    read: () => client.workflowRuns.get(workflowRunId),
    isDone,
    summarize: (run) =>
      `${run.status}; nodes=${run.nodeRuns.map((node) => `${node.workflowNodeKey}:${node.status}`).join(",")}`,
    timeoutMs,
    intervalMs,
  });
}

function assertWorkflowNotFailed(run: WorkflowRunResourceV1): void {
  if (run.status === "FAILED" || run.status === "CANCELLED") {
    throw new Error(
      `Workflow terminated unexpectedly: ${run.status}` +
        `${run.error ? ` (${run.error.code}: ${run.error.message})` : ""}`,
    );
  }
}

function assertWorkflowSucceeded(run: WorkflowRunResourceV1): void {
  if (run.status !== "SUCCEEDED") {
    throw new Error(
      `Workflow completed with ${run.status}${run.error ? ` (${run.error.code}: ${run.error.message})` : ""}.`,
    );
  }
}

function extractArtifactId(value: JsonValue | undefined): ArtifactId {
  const report = extractReportRecord(value);
  const artifact = report["artifact"];
  if (artifact === undefined || typeof artifact !== "object" || artifact === null || Array.isArray(artifact)) {
    throw new Error("Final workflow output did not contain an artifact reference.");
  }
  const record = artifact as Record<string, unknown>;
  if (record["type"] !== "artifact" || typeof record["artifactId"] !== "string") {
    throw new Error("Final workflow output contained an invalid artifact reference.");
  }
  return record["artifactId"] as ArtifactId;
}

function extractInterventionRoute(value: JsonValue | undefined): string {
  const report = extractReportRecord(value);
  return typeof report["interventionRoute"] === "string" ? report["interventionRoute"] : "unknown";
}

function extractReportRecord(value: JsonValue | undefined): Record<string, unknown> {
  if (value === undefined || typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Final workflow output did not contain a report object.");
  }
  const record = value as Record<string, unknown>;
  const report = record["report"];
  if (report === undefined || typeof report !== "object" || report === null || Array.isArray(report)) {
    throw new Error("Final workflow output did not contain report metadata.");
  }
  return report as Record<string, unknown>;
}

async function collectChildRunActivity(
  client: OsvaClient,
  http: OsvaHttpClient,
  workflowRun: WorkflowRunResourceV1,
): Promise<GrowthOperationsWorkflowResult["childRuns"]> {
  const activity: GrowthOperationsWorkflowResult["childRuns"][number][] = [];
  for (const node of workflowRun.nodeRuns) {
    if (node.childRunId === undefined) continue;
    const runId = node.childRunId as RunId;
    const attempts = await client.runs.listAttempts(runId);
    const attempt = attempts.attempts.at(-1);
    if (attempt === undefined) {
      activity.push({ node: node.workflowNodeKey, runId, steps: [] });
      continue;
    }
    const steps = await http.request<RunStepList>({
      method: "GET",
      path: `/v1/runs/${encodeURIComponent(runId)}/attempts/${encodeURIComponent(attempt.id as RunAttemptId)}/steps`,
    });
    activity.push({ node: node.workflowNodeKey, runId, attemptId: attempt.id, steps: steps.steps });
  }
  return activity;
}

function safeFilename(name: string): string {
  const base = path.basename(name);
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 160);
  if (cleaned.length === 0 || cleaned === "." || cleaned === "..") return "growth-operations-brief.md";
  return cleaned;
}
