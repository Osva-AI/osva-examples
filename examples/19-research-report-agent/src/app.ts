import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  AgentId,
  AgentVersionId,
  ArtifactId,
  AuthContextResourceV1,
  RunAttemptResourceV1,
} from "@osva-ai/contracts";
import { OsvaClient, OsvaHttpClient } from "@osva-ai/sdk";
import { optionalPositiveIntEnv, pollWithDeadline, requireEnv } from "@osva-examples/utils";

import { assertFixtureOutputMatchesEvaluation, runDeterministicEvaluation } from "./evaluation.js";
import { buildAgentManifestForRuntime, ensureNpmConnectorAndTools } from "./bootstrap.js";
import { deployTrustedResearchAgent } from "./deploy-trusted.js";
import { resolveModelProfileVersionId } from "./model-profile.js";
import { FIXTURE_PACKAGE_NAME } from "./bindings.js";
import { startExampleServices } from "./services.js";
import type { ResearchReportStructuredOutput } from "./agent-types.js";

const TERMINAL_ATTEMPTS = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]);

export interface ResearchReportExampleResult {
  readonly workspaceId: string;
  readonly runtimeMode: "REMOTE_HTTP" | "TRUSTED_TYPESCRIPT";
  readonly modelProfileVersionId: string;
  readonly connectorId: string;
  readonly connectorVersionId: string;
  readonly toolVersionIds: { readonly npmPackageMetadata: string; readonly npmDownloads: string };
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly runId: string;
  readonly attemptStatus: string;
  readonly output?: ResearchReportStructuredOutput;
  readonly artifactPath?: string;
  readonly modelActivity: readonly unknown[];
  readonly toolActivity: readonly unknown[];
  readonly evaluation?: {
    readonly evaluationRunId: string;
    readonly passed: boolean;
  };
  readonly polling: { readonly attempts: number; readonly elapsedMs: number };
}

export async function runResearchReportExample(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResearchReportExampleResult> {
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const trustedRoot = env.OSVA_TRUSTED_RUNTIME_ROOT?.trim();
  const runtimeUrl = env.OSVA_AGENT_RUNTIME_URL?.trim();
  const connectorUrl = env.OSVA_MCP_CONNECTOR_URL?.trim();
  const host = env.OSVA_EXAMPLE_LISTEN_HOST?.trim() || "127.0.0.1";
  const mcpPort = optionalPositiveIntEnv("OSVA_EXAMPLE_MCP_PORT", 8798, env);
  const runtimePort = optionalPositiveIntEnv("OSVA_EXAMPLE_RUNTIME_PORT", 8799, env);
  const timeoutMs = optionalPositiveIntEnv("OSVA_RUN_TIMEOUT_MS", 180_000, env);
  const intervalMs = optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env);
  const packageName = env.OSVA_EXAMPLE_PACKAGE_NAME?.trim() || "lodash";
  const includeDownloads = env.OSVA_EXAMPLE_INCLUDE_DOWNLOADS?.trim().toLowerCase() !== "false";
  const runEvaluation = env.OSVA_RUN_EVALUATION?.trim().toLowerCase() === "true";
  const suffix = (env.OSVA_EXAMPLE_KEY_SUFFIX?.trim() || randomUUID().slice(0, 8)).toLowerCase();

  const useTrusted = trustedRoot !== undefined && trustedRoot.length > 0;
  if (!useTrusted && (runtimeUrl === undefined || runtimeUrl.length === 0)) {
    throw new Error("Set OSVA_AGENT_RUNTIME_URL for REMOTE_HTTP mode or OSVA_TRUSTED_RUNTIME_ROOT for trusted mode.");
  }
  if (!useTrusted && (connectorUrl === undefined || connectorUrl.length === 0)) {
    throw new Error("Set OSVA_MCP_CONNECTOR_URL for REMOTE_HTTP mode (Streamable HTTP MCP).");
  }

  const services = useTrusted ? undefined : await startExampleServices({ host, mcpPort, runtimePort });
  try {
    const client = new OsvaClient({ baseUrl, apiKey });
    const http = new OsvaHttpClient({ baseUrl, apiKey });
    const auth = await http.request<AuthContextResourceV1>({ method: "GET", path: "/v1/auth/context" });
    const modelProfileVersionId = await resolveModelProfileVersionId(http, auth, env);

    const exampleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const stdioEntry = path.join(exampleRoot, "dist", "connector", "stdio.js");

    const tools = await ensureNpmConnectorAndTools(http, {
      suffix,
      connectorUrl: connectorUrl ?? `http://${host}:${mcpPort}/mcp`,
      ...(useTrusted
        ? {
            useStdio: {
              command: process.execPath,
              args: [stdioEntry],
            },
          }
        : {}),
    });

    const trusted = useTrusted ? await deployTrustedResearchAgent(trustedRoot) : undefined;
    const manifest = buildAgentManifestForRuntime({
      ...(trusted === undefined ? { runtimeUrl: runtimeUrl as string } : { trusted }),
      modelProfileVersionId,
      tools,
    });

    const agent = await client.agents.create({
      key: `examples-research-report-${suffix}`,
      name: `Examples Research Report ${suffix}`,
    });
    const agentVersion = await client.agents.createVersion(agent.id, { manifest });

    const created = await client.runs.create({
      agentId: agent.id as AgentId,
      agentVersionId: agentVersion.id as AgentVersionId,
      input: {
        packageName,
        includeDownloads,
        runKey: suffix,
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
    const modelActivity = steps.steps.filter((step) => step.kind === "MODEL");
    const toolActivity = steps.steps.filter((step) => step.kind === "TOOL");

    let artifactPath: string | undefined;
    let output = polled.value.output as ResearchReportStructuredOutput | undefined;

    if (output?.report?.artifactId !== undefined) {
      const download = await client.artifacts.download(output.report.artifactId as ArtifactId);
      const bytes = await readDownloadBody(download.body);
      const outputDir = path.join(process.cwd(), "output");
      await mkdir(outputDir, { recursive: true });
      artifactPath = path.join(outputDir, output.report.name);
      await writeFile(artifactPath, bytes);
    }

    let evaluation: ResearchReportExampleResult["evaluation"];
    if (runEvaluation && packageName === FIXTURE_PACKAGE_NAME && output !== undefined) {
      assertFixtureOutputMatchesEvaluation(output);
      evaluation = await runDeterministicEvaluation(client, agentVersion.id as AgentVersionId, suffix);
    }

    return {
      workspaceId: auth.workspaceId,
      runtimeMode: useTrusted ? "TRUSTED_TYPESCRIPT" : "REMOTE_HTTP",
      modelProfileVersionId,
      connectorId: tools.connectorId,
      connectorVersionId: tools.connectorVersionId,
      toolVersionIds: {
        npmPackageMetadata: tools.npmPackageMetadata,
        npmDownloads: tools.npmDownloads,
      },
      agentId: agent.id,
      agentVersionId: agentVersion.id,
      runId: created.run.id,
      attemptStatus: polled.value.status,
      ...(output === undefined ? {} : { output }),
      ...(artifactPath === undefined ? {} : { artifactPath }),
      modelActivity,
      toolActivity,
      ...(evaluation === undefined ? {} : { evaluation }),
      polling: { attempts: polled.attempts, elapsedMs: polled.elapsedMs },
    };
  } finally {
    await services?.close();
  }
}

async function readDownloadBody(body: ReadableStream<Uint8Array> | null): Promise<Buffer> {
  if (body === null) {
    throw new Error("Artifact download returned an empty body.");
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}
