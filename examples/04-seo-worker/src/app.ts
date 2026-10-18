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

import { DEMO_PAGE_URL } from "./fixtures.js";
import { buildSeoWorkerRequest, validateSeoWorkerInput } from "./input.js";
import { buildSeoWorkerAgentManifest } from "./runtime.js";
import { startSeoWorkerServices } from "./services.js";
import { APPROVAL_NODE, buildWorkflowDefinition, INSPECT_NODE, REPORT_NODE } from "./workflow.js";

const TERMINAL_WORKFLOWS = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

interface RunStepList {
  readonly steps: readonly {
    readonly id: string;
    readonly kind: "MODEL" | "TOOL" | "MEMORY" | "KNOWLEDGE";
    readonly bindingName?: string;
    readonly status: "RUNNING" | "SUCCEEDED" | "FAILED";
    readonly errorCode?: string;
  }[];
}

export interface SeoWorkerWorkflowResult {
  readonly workspaceId: string;
  readonly workflowRunId: string;
  readonly approvalRequestId: string;
  readonly status: string;
  readonly artifactId: string;
  readonly artifactPath: string;
  readonly recommendationCount: number;
  readonly childRuns: readonly {
    readonly node: string;
    readonly runId: string;
    readonly attemptId?: string;
    readonly steps: RunStepList["steps"];
  }[];
}

export async function runSeoWorkerWorkflow(env: NodeJS.ProcessEnv = process.env): Promise<SeoWorkerWorkflowResult> {
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const connectorUrl = requireEnv("OSVA_SEO_MCP_CONNECTOR_URL", env);
  const runtimeUrl = requireEnv("OSVA_SEO_RUNTIME_URL", env);
  const host = env.OSVA_EXAMPLE_LISTEN_HOST?.trim() || "127.0.0.1";
  const mcpPort = optionalPositiveIntEnv("OSVA_EXAMPLE_MCP_PORT", 8791, env);
  const runtimePort = optionalPositiveIntEnv("OSVA_EXAMPLE_RUNTIME_PORT", 8792, env);
  const timeoutMs = optionalPositiveIntEnv("OSVA_WORKFLOW_TIMEOUT_MS", 120_000, env);
  const intervalMs = optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env);
  const outputDir = path.resolve(env.OSVA_ARTIFACT_OUTPUT_DIR?.trim() || "output");
  const auditId = randomUUID();
  const suffix = auditId.slice(0, 8).toLowerCase();

  const pageUrl = env.OSVA_SEO_PAGE_URL?.trim() || DEMO_PAGE_URL;
  const targetKeyword = env.OSVA_SEO_TARGET_KEYWORD?.trim() || "cloud backup software";
  const businessContext = env.OSVA_SEO_BUSINESS_CONTEXT?.trim();
  const validated = validateSeoWorkerInput({
    url: pageUrl,
    targetKeyword,
    ...(businessContext === undefined || businessContext.length === 0 ? {} : { businessContext }),
  });
  const request = buildSeoWorkerRequest(validated, auditId);

  const services = await startSeoWorkerServices({ host, mcpPort, runtimePort });
  try {
    const client = new OsvaClient({ baseUrl, apiKey });
    const http = new OsvaHttpClient({ baseUrl, apiKey });
    const auth = await http.request<AuthContextResourceV1>({ method: "GET", path: "/v1/auth/context" });

    const connector = await http.request<ConnectorResourceV1>({
      method: "POST",
      path: "/v1/connectors",
      body: {
        key: `examples-seo-page-${suffix}`,
        name: `Examples SEO Page Inspector ${suffix}`,
        description: "Fixture-backed page inspection for the SEO worker example.",
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
    const discovered = discovery.tools.find((tool) => tool.remoteToolName === "fetch_page");
    if (discovered === undefined) {
      throw new Error("MCP discovery did not return the expected fetch_page capability.");
    }
    const imported = await http.request<ImportMcpToolsResponseV1>({
      method: "POST",
      path: "/v1/connectors/import-mcp-tools",
      body: {
        connectorVersionId: connectorVersion.id,
        tools: [
          {
            remoteToolName: discovered.remoteToolName,
            toolKey: `examples-fetch-page-${suffix}`,
            toolName: `Examples Fetch Page ${suffix}`,
          },
        ],
      },
    });
    const importedTool = imported.imported[0];
    if (importedTool === undefined) {
      throw new Error("OSVA returned no imported MCP tool.");
    }

    const agent = await client.agents.create({
      key: `examples-seo-worker-${suffix}`,
      name: `Examples SEO Worker ${suffix}`,
    });
    const agentVersion = await client.agents.createVersion(agent.id, {
      manifest: buildSeoWorkerAgentManifest(runtimeUrl, importedTool.toolVersionId as ToolVersionId),
    });
    const workflow = await client.workflows.create({
      key: `examples-seo-worker-${suffix}`,
      name: `Examples SEO Worker ${suffix}`,
      description: "Inspect, analyze, approve, and publish a Markdown SEO audit.",
    });
    const workflowVersion = await client.workflows.createVersion(workflow.id, {
      definition: buildWorkflowDefinition(agentVersion.id as AgentVersionId),
    });
    const started = await client.workflowRuns.create({
      workflowVersionId: workflowVersion.id,
      input: {
        request: {
          auditId: request.auditId,
          url: request.url,
          targetKeyword: request.targetKeyword,
          ...(request.businessContext === undefined ? {} : { businessContext: request.businessContext }),
        },
      },
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

    const approval = awaitingApproval.value.approvalRequests.find((item) => item.status === "PENDING");
    if (approval === undefined) {
      throw new Error(`Workflow never exposed a pending approval at ${APPROVAL_NODE}.`);
    }
    const approvalDecision = await getApprovalDecision(approval.id, env);
    await client.approvals.decide(approval.id as ApprovalRequestId, {
      decision: approvalDecision,
      comment:
        approvalDecision === "APPROVED"
          ? "Approved SEO audit recommendations in osva-examples."
          : "Rejected SEO audit publication in osva-examples.",
    });
    if (approvalDecision === "REJECTED") {
      throw new Error("The operator rejected the SEO audit; the Markdown artifact will not be published.");
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
    const inspectNode = completed.value.nodeRuns.find((node) => node.workflowNodeKey === INSPECT_NODE);
    if (inspectNode?.status !== "SUCCEEDED") {
      throw new Error(`Expected ${INSPECT_NODE} to succeed.`);
    }
    if (reportNode?.status !== "SUCCEEDED") {
      throw new Error(`Expected ${REPORT_NODE} to succeed.`);
    }

    const artifactId = extractArtifactId(reportNode?.output ?? completed.value.output);
    const recommendationCount = extractRecommendationCount(reportNode?.output ?? completed.value.output);
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
      recommendationCount,
      childRuns,
    };
  } finally {
    await services.close();
  }
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
      `SEO audit is paused at approval ${approvalRequestId}. Approve and publish the Markdown report? [y/N] `,
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

function extractRecommendationCount(value: JsonValue | undefined): number {
  const report = extractReportRecord(value);
  const count = report["recommendationCount"];
  if (typeof count !== "number") {
    return 0;
  }
  return count;
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
): Promise<SeoWorkerWorkflowResult["childRuns"]> {
  const activity: SeoWorkerWorkflowResult["childRuns"][number][] = [];
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
    activity.push({
      node: node.workflowNodeKey,
      runId,
      attemptId: attempt.id,
      steps: steps.steps,
    });
  }
  return activity;
}

function safeFilename(name: string): string {
  const base = path.basename(name);
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 160);
  if (cleaned.length === 0 || cleaned === "." || cleaned === "..") return "seo-audit.md";
  return cleaned;
}
