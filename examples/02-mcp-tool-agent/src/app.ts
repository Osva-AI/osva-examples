import { randomUUID } from "node:crypto";

import type {
  AgentId,
  AgentVersionId,
  AuthContextResourceV1,
  ConnectorResourceV1,
  ConnectorVersionResourceV1,
  DiscoverConnectorToolsResponseV1,
  ImportMcpToolsResponseV1,
  RunAttemptResourceV1,
  ToolVersionId,
} from "@osva-ai/contracts";
import { OsvaClient, OsvaHttpClient } from "@osva-ai/sdk";
import { optionalPositiveIntEnv, pollWithDeadline, requireEnv } from "@osva-examples/utils";

import { buildAgentManifest } from "./runtime.js";
import { startExampleServices } from "./services.js";

const TERMINAL_ATTEMPTS = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]);

interface RunStepList {
  readonly steps: readonly {
    readonly id: string;
    readonly kind: "MODEL" | "TOOL" | "MEMORY" | "KNOWLEDGE";
    readonly bindingName?: string;
    readonly status: "RUNNING" | "SUCCEEDED" | "FAILED";
    readonly toolVersionId?: string;
    readonly errorCode?: string;
  }[];
  readonly nextCursor?: string;
}

export interface McpToolExampleResult {
  readonly workspaceId: string;
  readonly connectorId: string;
  readonly connectorVersionId: string;
  readonly toolVersionId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly runId: string;
  readonly attemptStatus: string;
  readonly output?: unknown;
  readonly toolActivity: RunStepList["steps"];
  readonly polling: { readonly attempts: number; readonly elapsedMs: number };
}

export async function runMcpToolExample(env: NodeJS.ProcessEnv = process.env): Promise<McpToolExampleResult> {
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const connectorUrl = requireEnv("OSVA_MCP_CONNECTOR_URL", env);
  const runtimeUrl = requireEnv("OSVA_AGENT_RUNTIME_URL", env);
  const host = env.OSVA_EXAMPLE_LISTEN_HOST?.trim() || "127.0.0.1";
  const mcpPort = optionalPositiveIntEnv("OSVA_EXAMPLE_MCP_PORT", 8787, env);
  const runtimePort = optionalPositiveIntEnv("OSVA_EXAMPLE_RUNTIME_PORT", 8788, env);
  const timeoutMs = optionalPositiveIntEnv("OSVA_RUN_TIMEOUT_MS", 60_000, env);
  const intervalMs = optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env);
  const inputText = env.OSVA_EXAMPLE_INPUT_TEXT?.trim() || "hello from the mcp tool example";
  const suffix = (env.OSVA_EXAMPLE_KEY_SUFFIX?.trim() || randomUUID().slice(0, 8)).toLowerCase();

  const services = await startExampleServices({ host, mcpPort, runtimePort });
  try {
    const client = new OsvaClient({ baseUrl, apiKey });
    const http = new OsvaHttpClient({ baseUrl, apiKey });
    const auth = await http.request<AuthContextResourceV1>({ method: "GET", path: "/v1/auth/context" });

    const connector = await http.request<ConnectorResourceV1>({
      method: "POST",
      path: "/v1/connectors",
      body: {
        key: `examples-normalize-${suffix}`,
        name: `Examples Normalize Text ${suffix}`,
        description: "Ephemeral registry entry for the osva-examples MCP demonstration.",
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
    const discovered = discovery.tools.find((tool) => tool.remoteToolName === "normalize_text");
    if (discovered === undefined) {
      throw new Error("MCP discovery did not return the expected normalize_text capability.");
    }

    const imported = await http.request<ImportMcpToolsResponseV1>({
      method: "POST",
      path: "/v1/connectors/import-mcp-tools",
      body: {
        connectorVersionId: connectorVersion.id,
        tools: [
          {
            remoteToolName: discovered.remoteToolName,
            toolKey: `examples-normalize-${suffix}`,
            toolName: `Examples Normalize Text ${suffix}`,
          },
        ],
      },
    });
    const importedTool = imported.imported[0];
    if (importedTool === undefined) throw new Error("OSVA returned no imported MCP tool.");

    const agent = await client.agents.create({
      key: `examples-mcp-agent-${suffix}`,
      name: `Examples MCP Agent ${suffix}`,
    });
    const agentVersion = await client.agents.createVersion(agent.id, {
      manifest: buildAgentManifest(runtimeUrl, importedTool.toolVersionId as ToolVersionId),
    });
    const created = await client.runs.create({
      agentId: agent.id as AgentId,
      agentVersionId: agentVersion.id as AgentVersionId,
      input: { text: inputText },
    });
    const polled = await pollWithDeadline<RunAttemptResourceV1>({
      description: `RunAttempt ${created.runAttempt.id}`,
      read: () => client.runs.getAttempt(created.run.id, created.runAttempt.id),
      isDone: (attempt) => TERMINAL_ATTEMPTS.has(attempt.status),
      summarize: (attempt) => attempt.status,
      timeoutMs,
      intervalMs,
    });
    const stepList = await http.request<RunStepList>({
      method: "GET",
      path:
        `/v1/runs/${encodeURIComponent(created.run.id)}/attempts/` +
        `${encodeURIComponent(created.runAttempt.id)}/steps`,
    });
    const toolActivity = stepList.steps.filter((step) => step.kind === "TOOL");

    return {
      workspaceId: auth.workspaceId,
      connectorId: connector.id,
      connectorVersionId: connectorVersion.id,
      toolVersionId: importedTool.toolVersionId,
      agentId: agent.id,
      agentVersionId: agentVersion.id,
      runId: created.run.id,
      attemptStatus: polled.value.status,
      ...(polled.value.output === undefined ? {} : { output: polled.value.output }),
      toolActivity,
      polling: { attempts: polled.attempts, elapsedMs: polled.elapsedMs },
    };
  } finally {
    await services.close();
  }
}
