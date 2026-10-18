import { randomUUID } from "node:crypto";

import type {
  AgentId,
  AgentVersionId,
  AuthContextResourceV1,
  ModelProfileVersionId,
  RunAttemptResourceV1,
} from "@osva-ai/contracts";
import { OsvaClient, OsvaHttpClient } from "@osva-ai/sdk";
import { optionalPositiveIntEnv, pollWithDeadline, requireEnv } from "@osva-examples/utils";

import { resolveModelProfileVersionId } from "./model-profile.js";
import { buildAgentManifest } from "./runtime.js";
import { startExampleServices } from "./services.js";

const TERMINAL_ATTEMPTS = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]);

interface RunStepList {
  readonly steps: readonly {
    readonly id: string;
    readonly kind: "MODEL" | "TOOL" | "MEMORY" | "KNOWLEDGE";
    readonly bindingName?: string;
    readonly status: "RUNNING" | "SUCCEEDED" | "FAILED";
    readonly modelProfileVersionId?: string;
    readonly errorCode?: string;
  }[];
  readonly nextCursor?: string;
}

export interface ModelPoweredExampleResult {
  readonly workspaceId: string;
  readonly modelProfileVersionId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly runId: string;
  readonly attemptStatus: string;
  readonly output?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
  readonly modelActivity: RunStepList["steps"];
  readonly polling: { readonly attempts: number; readonly elapsedMs: number };
}

export async function runModelPoweredExample(env: NodeJS.ProcessEnv = process.env): Promise<ModelPoweredExampleResult> {
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const runtimeUrl = requireEnv("OSVA_AGENT_RUNTIME_URL", env);
  const host = env.OSVA_EXAMPLE_LISTEN_HOST?.trim() || "127.0.0.1";
  const runtimePort = optionalPositiveIntEnv("OSVA_EXAMPLE_RUNTIME_PORT", 8789, env);
  const timeoutMs = optionalPositiveIntEnv("OSVA_RUN_TIMEOUT_MS", 120_000, env);
  const intervalMs = optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env);
  const question = env.OSVA_EXAMPLE_INPUT_QUESTION?.trim() || "How do I cancel my subscription and get a refund?";
  const suffix = (env.OSVA_EXAMPLE_KEY_SUFFIX?.trim() || randomUUID().slice(0, 8)).toLowerCase();

  const services = await startExampleServices({ host, runtimePort });
  try {
    const client = new OsvaClient({ baseUrl, apiKey });
    const http = new OsvaHttpClient({ baseUrl, apiKey });
    const auth = await http.request<AuthContextResourceV1>({ method: "GET", path: "/v1/auth/context" });
    const modelProfileVersionId = await resolveModelProfileVersionId(http, auth, env);

    const agent = await client.agents.create({
      key: `examples-model-agent-${suffix}`,
      name: `Examples Model Agent ${suffix}`,
    });
    const agentVersion = await client.agents.createVersion(agent.id, {
      manifest: buildAgentManifest(runtimeUrl, modelProfileVersionId as ModelProfileVersionId),
    });
    const created = await client.runs.create({
      agentId: agent.id as AgentId,
      agentVersionId: agentVersion.id as AgentVersionId,
      input: { question },
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
    const modelActivity = stepList.steps.filter((step) => step.kind === "MODEL");

    return {
      workspaceId: auth.workspaceId,
      modelProfileVersionId,
      agentId: agent.id,
      agentVersionId: agentVersion.id,
      runId: created.run.id,
      attemptStatus: polled.value.status,
      ...(polled.value.output === undefined ? {} : { output: polled.value.output }),
      ...(polled.value.error === undefined ? {} : { error: polled.value.error }),
      modelActivity,
      polling: { attempts: polled.attempts, elapsedMs: polled.elapsedMs },
    };
  } finally {
    await services.close();
  }
}
