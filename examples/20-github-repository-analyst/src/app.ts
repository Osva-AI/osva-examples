import { randomUUID } from "node:crypto";

import type { AgentId, AgentVersionId, RunAttemptResourceV1 } from "@osva-ai/contracts";
import { OsvaClient } from "@osva-ai/sdk";
import { optionalPositiveIntEnv, pollWithDeadline, requireEnv } from "@osva-examples/utils";

import { buildAgentManifestForRuntime, ensureGithubConnectorAndTools } from "./bootstrap.js";
import { buildPublishedGithubConnectorStdioTransport } from "./connector/stdio-command.js";
import { deployTrustedRepositoryAnalyst } from "./deploy-trusted.js";
import { FIXTURE_REPO_NAME, FIXTURE_REPO_OWNER } from "./bindings.js";
import type { IssueStateFilter } from "./input.js";
import { startExampleServices } from "./services.js";
import type { RepositoryAnalystStructuredOutput } from "./agent-types.js";

const TERMINAL_ATTEMPTS = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]);

export interface RepositoryAnalystExampleResult {
  readonly workspaceId: string;
  readonly runtimeMode: "REMOTE_HTTP" | "TRUSTED_TYPESCRIPT";
  readonly connectorId: string;
  readonly connectorVersionId: string;
  readonly toolVersionIds: {
    readonly repositoryGet: string;
    readonly issueList: string;
    readonly issueGet: string;
  };
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly runId: string;
  readonly attemptStatus: string;
  readonly output?: RepositoryAnalystStructuredOutput;
  readonly toolActivity: readonly unknown[];
  readonly polling: { readonly attempts: number; readonly elapsedMs: number };
}

export async function runRepositoryAnalystExample(
  env: NodeJS.ProcessEnv = process.env,
): Promise<RepositoryAnalystExampleResult> {
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const trustedRoot = env.OSVA_TRUSTED_RUNTIME_ROOT?.trim();
  const runtimeUrl = env.OSVA_AGENT_RUNTIME_URL?.trim();
  const host = env.OSVA_EXAMPLE_LISTEN_HOST?.trim() || "127.0.0.1";
  const runtimePort = optionalPositiveIntEnv("OSVA_EXAMPLE_RUNTIME_PORT", 8801, env);
  const timeoutMs = optionalPositiveIntEnv("OSVA_RUN_TIMEOUT_MS", 180_000, env);
  const intervalMs = optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env);
  const owner = env.OSVA_EXAMPLE_REPO_OWNER?.trim() || "Osva-AI";
  const repo = env.OSVA_EXAMPLE_REPO_NAME?.trim() || "osva-examples";
  const maxIssueSampleSize = optionalPositiveIntEnv("OSVA_EXAMPLE_MAX_ISSUE_SAMPLE", 20, env);
  const issueState = parseIssueStateEnv(env.OSVA_EXAMPLE_ISSUE_STATE);
  const issuePageLimit = optionalPositiveIntEnv("OSVA_EXAMPLE_ISSUE_PAGE_LIMIT", 1, env);
  const suffix = (env.OSVA_EXAMPLE_KEY_SUFFIX?.trim() || randomUUID().slice(0, 8)).toLowerCase();

  const useTrusted = trustedRoot !== undefined && trustedRoot.length > 0;
  const useStdioConnector = parseStdioConnectorOptIn(env, useTrusted);

  if (!useTrusted && (runtimeUrl === undefined || runtimeUrl.length === 0)) {
    throw new Error("Set OSVA_AGENT_RUNTIME_URL for REMOTE_HTTP mode or OSVA_TRUSTED_RUNTIME_ROOT for trusted mode.");
  }
  if (!useStdioConnector) {
    throw new Error(
      "GitHub MCP requires worker STDIO. Set OSVA_MCP_CONNECTOR_STDIO=true (or use OSVA_TRUSTED_RUNTIME_ROOT).",
    );
  }

  const services = useTrusted
    ? undefined
    : await startExampleServices({
        host,
        runtimePort,
      });

  try {
    const client = new OsvaClient({ baseUrl, apiKey });
    const auth = await client.auth.getContext();

    const tools = await ensureGithubConnectorAndTools(client, {
      suffix,
      useStdio: resolveStdioTransport(env),
    });

    const trusted = useTrusted ? await deployTrustedRepositoryAnalyst(trustedRoot as string) : undefined;
    const manifest = buildAgentManifestForRuntime({
      ...(trusted === undefined ? { runtimeUrl: runtimeUrl as string } : { trusted }),
      tools,
    });

    const agent = await client.agents.create({
      key: `examples-github-analyst-${suffix}`,
      name: `Examples GitHub Repository Analyst ${suffix}`,
    });
    const agentVersion = await client.agents.createVersion(agent.id, { manifest });

    const runKey = owner === FIXTURE_REPO_OWNER && repo === FIXTURE_REPO_NAME ? "evaluation-fixture" : `live-${suffix}`;

    const created = await client.runs.create({
      agentId: agent.id as AgentId,
      agentVersionId: agentVersion.id as AgentVersionId,
      input: {
        owner,
        repo,
        maxIssueSampleSize,
        issueState,
        issuePageLimit,
        runKey,
      },
    });

    const polled = await pollWithDeadline<RunAttemptResourceV1>({
      description: `RunAttempt ${created.runAttempt.id}`,
      read: () => client.runs.getAttempt(created.run.id, created.runAttempt.id),
      isDone: (attempt) => TERMINAL_ATTEMPTS.has(attempt.status),
      summarize: (attempt) => attempt.status,
      timeoutMs,
      intervalMs,
    });

    const steps = await client.runObservability.listSteps(created.run.id, created.runAttempt.id);
    const toolActivity = steps.steps.filter((step) => step.kind === "TOOL");

    const output = polled.value.output as RepositoryAnalystStructuredOutput | undefined;

    return {
      workspaceId: auth.workspaceId,
      runtimeMode: useTrusted ? "TRUSTED_TYPESCRIPT" : "REMOTE_HTTP",
      connectorId: tools.connectorId,
      connectorVersionId: tools.connectorVersionId,
      toolVersionIds: {
        repositoryGet: tools.repositoryGet,
        issueList: tools.issueList,
        issueGet: tools.issueGet,
      },
      agentId: agent.id,
      agentVersionId: agentVersion.id,
      runId: created.run.id,
      attemptStatus: polled.value.status,
      ...(output === undefined ? {} : { output }),
      toolActivity,
      polling: { attempts: polled.attempts, elapsedMs: polled.elapsedMs },
    };
  } finally {
    await services?.close();
  }
}

function parseIssueStateEnv(value: string | undefined): IssueStateFilter {
  if (value === undefined || value.trim().length === 0) return "open";
  const normalized = value.trim().toLowerCase();
  if (normalized === "open" || normalized === "closed" || normalized === "all") return normalized;
  throw new Error("OSVA_EXAMPLE_ISSUE_STATE must be open, closed, or all.");
}

function parseStdioConnectorOptIn(env: NodeJS.ProcessEnv, useTrusted: boolean): boolean {
  if (useTrusted) return true;
  return env.OSVA_MCP_CONNECTOR_STDIO?.trim().toLowerCase() === "true";
}

function resolveStdioTransport(env: NodeJS.ProcessEnv): { readonly command: string; readonly args: readonly string[] } {
  const command = env.OSVA_MCP_CONNECTOR_STDIO_COMMAND?.trim();
  const argsJson = env.OSVA_MCP_CONNECTOR_STDIO_ARGS_JSON?.trim();
  if (command !== undefined && command.length > 0 && argsJson !== undefined && argsJson.length > 0) {
    const parsed: unknown = JSON.parse(argsJson);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error("OSVA_MCP_CONNECTOR_STDIO_ARGS_JSON must be a JSON array of strings.");
    }
    return { command, args: parsed };
  }
  return buildPublishedGithubConnectorStdioTransport();
}
