import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import type {
  AgentVersionId,
  ApprovalRequestId,
  ArtifactId,
  AuthContextResourceV1,
  JsonValue,
  RunAttemptId,
  RunId,
  WorkflowRunResourceV1,
} from "@osva-ai/contracts";
import { OsvaClient, OsvaHttpClient } from "@osva-ai/sdk";
import { isJsonRecord, optionalPositiveIntEnv, pollWithDeadline, requireEnv } from "@osva-examples/utils";

import { buildReviewAgentManifest } from "./runtime.js";
import { startReviewRuntime } from "./services.js";
import {
  APPROVAL_NODE,
  buildWorkflowDefinition,
  EVENT_SOURCE,
  EVENT_TYPE,
  REPORT_NODE,
  WAIT_NODE,
} from "./workflow.js";

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

interface WorkflowEventResource {
  readonly id: string;
  readonly workspaceId: string;
  readonly source: string;
  readonly eventType: string;
  readonly correlationKey: string;
  readonly idempotencyKey: string;
  readonly payload: JsonValue;
  readonly receivedAt: string;
}

export interface DurableWorkflowResult {
  readonly workspaceId: string;
  readonly workflowRunId: string;
  readonly approvalRequestId: string;
  readonly eventId: string;
  readonly status: string;
  readonly artifactId: string;
  readonly artifactPath: string;
  readonly childRuns: readonly {
    readonly node: string;
    readonly runId: string;
    readonly attemptId?: string;
    readonly steps: RunStepList["steps"];
  }[];
}

export async function runDurableReviewWorkflow(env: NodeJS.ProcessEnv = process.env): Promise<DurableWorkflowResult> {
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const runtimeUrl = requireEnv("OSVA_REVIEW_RUNTIME_URL", env);
  const host = env.OSVA_EXAMPLE_LISTEN_HOST?.trim() || "127.0.0.1";
  const port = optionalPositiveIntEnv("OSVA_EXAMPLE_RUNTIME_PORT", 8790, env);
  const timeoutMs = optionalPositiveIntEnv("OSVA_WORKFLOW_TIMEOUT_MS", 120_000, env);
  const intervalMs = optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env);
  const subject = env.OSVA_REVIEW_SUBJECT?.trim() || "Example dependency";
  const question = env.OSVA_REVIEW_QUESTION?.trim() || "Should this dependency be adopted?";
  const outputDir = path.resolve(env.OSVA_ARTIFACT_OUTPUT_DIR?.trim() || "output");
  const requestId = randomUUID();
  const suffix = requestId.slice(0, 8).toLowerCase();

  const runtime = await startReviewRuntime({ host, port });
  try {
    const client = new OsvaClient({ baseUrl, apiKey });
    const http = new OsvaHttpClient({ baseUrl, apiKey });
    const auth = await http.request<AuthContextResourceV1>({ method: "GET", path: "/v1/auth/context" });

    const agent = await client.agents.create({
      key: `examples-review-agent-${suffix}`,
      name: `Examples Review Agent ${suffix}`,
    });
    const agentVersion = await client.agents.createVersion(agent.id, {
      manifest: buildReviewAgentManifest(runtimeUrl),
    });
    const workflow = await client.workflows.create({
      key: `examples-durable-review-${suffix}`,
      name: `Examples Durable Review ${suffix}`,
      description: "Public-interface durable review workflow reference.",
    });
    const workflowVersion = await client.workflows.createVersion(workflow.id, {
      definition: buildWorkflowDefinition(agentVersion.id as AgentVersionId),
    });
    const started = await client.workflowRuns.create({
      workflowVersionId: workflowVersion.id,
      input: { request: { requestId, subject, question } },
    });

    const awaitingApproval = await waitForWorkflow(
      client,
      started.id,
      (run) =>
        run.approvalRequests.some((approval) => approval.status === "PENDING") || TERMINAL_WORKFLOWS.has(run.status),
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
          ? "Approved by the osva-examples operator."
          : "Rejected by the osva-examples operator.",
    });
    if (approvalDecision === "REJECTED") {
      throw new Error("The operator rejected the review; the workflow will not continue to delivery.");
    }

    const awaitingEvent = await waitForWorkflow(
      client,
      started.id,
      (run) =>
        run.nodeRuns.some((node) => node.workflowNodeKey === WAIT_NODE && node.status === "WAITING") ||
        TERMINAL_WORKFLOWS.has(run.status),
      timeoutMs,
      intervalMs,
      "external delivery event wait",
    );
    assertWorkflowNotFailed(awaitingEvent.value);
    const event = await http.request<WorkflowEventResource>({
      method: "POST",
      path: "/v1/workflow-events",
      body: {
        source: EVENT_SOURCE,
        eventType: EVENT_TYPE,
        correlationKey: requestId,
        idempotencyKey: `examples-delivery-${requestId}`,
        payload: { delivered: true },
      },
    });

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
    const artifactId = extractArtifactId(reportNode?.output ?? completed.value.output);
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
      eventId: event.id,
      status: completed.value.status,
      artifactId,
      artifactPath,
      childRuns,
    };
  } finally {
    await runtime.close();
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
      `Workflow is paused at approval ${approvalRequestId}. Approve and continue? [y/N] `,
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
      `Workflow terminated before the expected gate: ${run.status}` +
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
  if (value === undefined || !isJsonRecord(value)) {
    throw new Error("Final workflow output did not contain a report object.");
  }
  const report = value["report"];
  if (report === undefined || !isJsonRecord(report)) {
    throw new Error("Final workflow output did not contain report metadata.");
  }
  const artifact = report["artifact"];
  if (artifact === undefined || !isJsonRecord(artifact)) {
    throw new Error("Final workflow output did not contain an artifact reference.");
  }
  if (artifact["type"] !== "artifact" || typeof artifact["artifactId"] !== "string") {
    throw new Error("Final workflow output contained an invalid artifact reference.");
  }
  return artifact["artifactId"] as ArtifactId;
}

async function collectChildRunActivity(
  client: OsvaClient,
  http: OsvaHttpClient,
  workflowRun: WorkflowRunResourceV1,
): Promise<DurableWorkflowResult["childRuns"]> {
  const activity: DurableWorkflowResult["childRuns"][number][] = [];
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
  if (cleaned.length === 0 || cleaned === "." || cleaned === "..") return "review.md";
  return cleaned;
}
