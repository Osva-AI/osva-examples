import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";

import type {
  AgentVersionId,
  ApprovalRequestId,
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
import { isJsonRecord, optionalPositiveIntEnv, pollWithDeadline, requireEnv } from "@osva-examples/utils";

import {
  DEFAULT_CUSTOMER_ID,
  DEFAULT_SUPPORT_MESSAGE,
  buildSupportWorkerRequest,
  validateSupportWorkerInput,
} from "./input.js";
import { buildCustomerSupportAgentManifest } from "./runtime.js";
import { startCustomerSupportServices } from "./services.js";
import { ACTION_NODE, LOOKUP_NODE, RESPONSE_NODE, buildWorkflowDefinition } from "./workflow.js";

const TERMINAL_WORKFLOWS = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

const REMOTE_TOOL_NAMES = ["get_customer", "get_order", "get_shipment", "issue_refund", "cancel_order"] as const;

interface RunStepList {
  readonly steps: readonly {
    readonly id: string;
    readonly kind: "MODEL" | "TOOL" | "MEMORY" | "KNOWLEDGE";
    readonly bindingName?: string;
    readonly status: "RUNNING" | "SUCCEEDED" | "FAILED";
    readonly errorCode?: string;
  }[];
}

export interface CustomerSupportWorkflowResult {
  readonly workspaceId: string;
  readonly workflowRunId: string;
  readonly approvalRequestId?: string;
  readonly approvalDecision?: "APPROVED" | "REJECTED";
  readonly status: string;
  readonly route?: string;
  readonly response: string;
  readonly childRuns: readonly {
    readonly node: string;
    readonly runId: string;
    readonly attemptId?: string;
    readonly steps: RunStepList["steps"];
  }[];
}

export async function runCustomerSupportWorkflow(
  env: NodeJS.ProcessEnv = process.env,
): Promise<CustomerSupportWorkflowResult> {
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const connectorUrl = requireEnv("OSVA_SUPPORT_MCP_CONNECTOR_URL", env);
  const runtimeUrl = requireEnv("OSVA_SUPPORT_RUNTIME_URL", env);
  const host = env.OSVA_EXAMPLE_LISTEN_HOST?.trim() || "127.0.0.1";
  const mcpPort = optionalPositiveIntEnv("OSVA_EXAMPLE_MCP_PORT", 8795, env);
  const runtimePort = optionalPositiveIntEnv("OSVA_EXAMPLE_RUNTIME_PORT", 8796, env);
  const timeoutMs = optionalPositiveIntEnv("OSVA_WORKFLOW_TIMEOUT_MS", 180_000, env);
  const intervalMs = optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env);
  const ticketId = randomUUID();
  const suffix = ticketId.slice(0, 8).toLowerCase();

  const customerId = env.OSVA_SUPPORT_CUSTOMER_ID?.trim() || DEFAULT_CUSTOMER_ID;
  const message = env.OSVA_SUPPORT_MESSAGE?.trim() || DEFAULT_SUPPORT_MESSAGE;
  const validated = validateSupportWorkerInput({ customerId, message });
  const request = buildSupportWorkerRequest(validated, ticketId);

  const services = await startCustomerSupportServices({ host, mcpPort, runtimePort });
  try {
    const client = new OsvaClient({ baseUrl, apiKey });
    const http = new OsvaHttpClient({ baseUrl, apiKey });
    const auth = await http.request<AuthContextResourceV1>({ method: "GET", path: "/v1/auth/context" });

    const connector = await http.request<ConnectorResourceV1>({
      method: "POST",
      path: "/v1/connectors",
      body: {
        key: `examples-support-${suffix}`,
        name: `Examples Support ${suffix}`,
        description: "Fixture-backed support lookup and action tools for the customer support worker.",
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

    const toolVersionIds = await importSupportTools(http, discovery, connectorVersion.id, suffix);

    const agent = await client.agents.create({
      key: `examples-customer-support-${suffix}`,
      name: `Examples Customer Support ${suffix}`,
    });
    const agentVersion = await client.agents.createVersion(agent.id, {
      manifest: buildCustomerSupportAgentManifest(runtimeUrl, toolVersionIds),
    });
    const workflow = await client.workflows.create({
      key: `examples-customer-support-${suffix}`,
      name: `Examples Customer Support ${suffix}`,
      description: "Classify, lookup, policy, route, approve, act, and respond to demo support tickets.",
    });
    const workflowVersion = await client.workflows.createVersion(workflow.id, {
      definition: buildWorkflowDefinition(agentVersion.id as AgentVersionId),
    });
    const started = await client.workflowRuns.create({
      workflowVersionId: workflowVersion.id,
      input: {
        request: {
          ticketId: request.ticketId,
          customerId: request.customerId,
          message: request.message,
        },
      },
    });

    let approvalRequestId: string | undefined;
    let approvalDecision: "APPROVED" | "REJECTED" | undefined;

    const awaitingApproval = await waitForWorkflow(
      client,
      started.id,
      (run) => run.approvalRequests.some((item) => item.status === "PENDING") || TERMINAL_WORKFLOWS.has(run.status),
      timeoutMs,
      intervalMs,
      "approval or completion",
    );
    assertWorkflowNotFailed(awaitingApproval.value);

    const pendingApproval = awaitingApproval.value.approvalRequests.find((item) => item.status === "PENDING");
    if (pendingApproval !== undefined) {
      approvalRequestId = pendingApproval.id;
      approvalDecision = await getApprovalDecision(pendingApproval.id, env);
      await client.approvals.decide(pendingApproval.id as ApprovalRequestId, {
        decision: approvalDecision,
        comment:
          approvalDecision === "APPROVED"
            ? "Approved sensitive support action in osva-examples."
            : "Rejected sensitive support action in osva-examples.",
      });
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

    const lookupNode = completed.value.nodeRuns.find((node) => node.workflowNodeKey === LOOKUP_NODE);
    const actionNode = completed.value.nodeRuns.find((node) => node.workflowNodeKey === ACTION_NODE);
    const responseNode = completed.value.nodeRuns.find((node) => node.workflowNodeKey === RESPONSE_NODE);
    if (lookupNode?.status !== "SUCCEEDED") {
      throw new Error(`Expected ${LOOKUP_NODE} to succeed.`);
    }
    if (responseNode?.status !== "SUCCEEDED") {
      throw new Error(`Expected ${RESPONSE_NODE} to succeed.`);
    }
    if (actionNode !== undefined && actionNode.status === "SKIPPED") {
      // Branch skipped action for reply-only / escalation paths.
    }

    const output = responseNode?.output ?? completed.value.output;
    const { response, route } = extractFinalEnvelopeFields(output);
    const childRuns = await collectChildRunActivity(client, http, completed.value);

    return {
      workspaceId: auth.workspaceId,
      workflowRunId: completed.value.id,
      ...(approvalRequestId === undefined ? {} : { approvalRequestId }),
      ...(approvalDecision === undefined ? {} : { approvalDecision }),
      status: completed.value.status,
      ...(route === undefined ? {} : { route }),
      response,
      childRuns,
    };
  } finally {
    await services.close();
  }
}

async function importSupportTools(
  http: OsvaHttpClient,
  discovery: DiscoverConnectorToolsResponseV1,
  connectorVersionId: string,
  suffix: string,
): Promise<{
  getCustomer: ToolVersionId;
  getOrder: ToolVersionId;
  getShipment: ToolVersionId;
  issueRefund: ToolVersionId;
  cancelOrder: ToolVersionId;
}> {
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
  const getCustomer = byRemote.get("get_customer");
  const getOrder = byRemote.get("get_order");
  const getShipment = byRemote.get("get_shipment");
  const issueRefund = byRemote.get("issue_refund");
  const cancelOrder = byRemote.get("cancel_order");
  if (getCustomer === undefined || getOrder === undefined || getShipment === undefined) {
    throw new Error("Support data tools were not imported.");
  }
  if (issueRefund === undefined || cancelOrder === undefined) {
    throw new Error("Support action tools were not imported.");
  }
  return { getCustomer, getOrder, getShipment, issueRefund, cancelOrder };
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
      `Sensitive support action paused at approval ${approvalRequestId}. Approve execution? [y/N] `,
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

function extractFinalEnvelopeFields(value: JsonValue | undefined): { response: string; route?: string } {
  if (value === undefined || !isJsonRecord(value)) {
    throw new Error("Final workflow output must be an object.");
  }
  const response = value["response"];
  if (typeof response !== "string" || response.trim().length === 0) {
    throw new Error("Final workflow output did not include a customer response.");
  }
  const route = value["route"];
  return {
    response,
    ...(typeof route === "string" ? { route } : {}),
  };
}

async function collectChildRunActivity(
  client: OsvaClient,
  http: OsvaHttpClient,
  workflowRun: WorkflowRunResourceV1,
): Promise<CustomerSupportWorkflowResult["childRuns"]> {
  const activity: CustomerSupportWorkflowResult["childRuns"][number][] = [];
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
