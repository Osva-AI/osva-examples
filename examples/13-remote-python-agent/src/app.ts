import { randomUUID } from "node:crypto";

import type { AgentId, AgentVersionId, RunAttemptResourceV1 } from "@osva-ai/contracts";
import { OsvaClient } from "@osva-ai/sdk";
import { optionalPositiveIntEnv, pollWithDeadline, requireEnv } from "@osva-examples/utils";

import { buildAgentManifest } from "./runtime.js";
import { startExampleServices } from "./services.js";

const TERMINAL_ATTEMPTS = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]);

export interface RemotePythonExampleResult {
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly runId: string;
  readonly attemptStatus: string;
  readonly output?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
  readonly polling: { readonly attempts: number; readonly elapsedMs: number };
}

export async function runRemotePythonExample(env: NodeJS.ProcessEnv = process.env): Promise<RemotePythonExampleResult> {
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const runtimeUrl = requireEnv("OSVA_AGENT_RUNTIME_URL", env);
  const host = env.OSVA_EXAMPLE_LISTEN_HOST?.trim() || "127.0.0.1";
  const runtimePort = optionalPositiveIntEnv("OSVA_EXAMPLE_RUNTIME_PORT", 8790, env);
  const timeoutMs = optionalPositiveIntEnv("OSVA_RUN_TIMEOUT_MS", 60_000, env);
  const intervalMs = optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env);
  const inputText = env.OSVA_EXAMPLE_INPUT_TEXT?.trim() || "hello from the remote python example";
  const suffix = (env.OSVA_EXAMPLE_KEY_SUFFIX?.trim() || randomUUID().slice(0, 8)).toLowerCase();

  const services = await startExampleServices({ host, runtimePort, env });
  try {
    const client = new OsvaClient({ baseUrl, apiKey });
    const agent = await client.agents.create({
      key: `examples-python-agent-${suffix}`,
      name: `Examples Python Agent ${suffix}`,
    });
    const agentVersion = await client.agents.createVersion(agent.id, {
      manifest: buildAgentManifest(runtimeUrl),
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

    return {
      agentId: agent.id,
      agentVersionId: agentVersion.id,
      runId: created.run.id,
      attemptStatus: polled.value.status,
      ...(polled.value.output === undefined ? {} : { output: polled.value.output }),
      ...(polled.value.error === undefined ? {} : { error: polled.value.error }),
      polling: { attempts: polled.attempts, elapsedMs: polled.elapsedMs },
    };
  } finally {
    await services.close();
  }
}
