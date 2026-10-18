import { randomUUID } from "node:crypto";

import type { AgentId, AgentVersionId, RunAttemptResourceV1, RunId } from "@osva-ai/contracts";
import { OsvaClient } from "@osva-ai/sdk";
import { optionalPositiveIntEnv, pollWithDeadline, requireEnv } from "@osva-examples/utils";

import { resetCheckpointStore } from "./checkpoint.js";
import { buildAgentManifest } from "./runtime.js";
import { startExampleServices } from "./services.js";

const TERMINAL_RUN = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]);
const TERMINAL_ATTEMPT = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]);

export interface FailureRecoveryExampleResult {
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly runId: string;
  readonly manifestMaxAttempts: number;
  readonly attemptCount: number;
  readonly attempts: readonly { readonly id: string; readonly sequence: number; readonly status: string }[];
  readonly finalAttemptStatus: string;
  readonly output?: unknown;
}

export async function runFailureRecoveryExample(
  env: NodeJS.ProcessEnv = process.env,
): Promise<FailureRecoveryExampleResult> {
  resetCheckpointStore();
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const runtimeUrl = requireEnv("OSVA_AGENT_RUNTIME_URL", env);
  const host = env.OSVA_EXAMPLE_LISTEN_HOST?.trim() || "127.0.0.1";
  const runtimePort = optionalPositiveIntEnv("OSVA_EXAMPLE_RUNTIME_PORT", 8799, env);
  const jobId = env.OSVA_EXAMPLE_JOB_ID?.trim() || `job-${randomUUID().slice(0, 8)}`;
  const failUntilAttempt = optionalPositiveIntEnv("OSVA_FAILURE_FAIL_UNTIL_ATTEMPT", 2, env);
  const suffix = (env.OSVA_EXAMPLE_KEY_SUFFIX?.trim() || randomUUID().slice(0, 8)).toLowerCase();
  const manifest = buildAgentManifest(runtimeUrl);

  const services = await startExampleServices({ host, runtimePort });
  try {
    const client = new OsvaClient({ baseUrl, apiKey });
    const agent = await client.agents.create({
      key: `examples-failure-recovery-${suffix}`,
      name: `Examples Failure Recovery ${suffix}`,
    });
    const agentVersion = await client.agents.createVersion(agent.id, {
      manifest,
    });
    const created = await client.runs.create({
      agentId: agent.id as AgentId,
      agentVersionId: agentVersion.id as AgentVersionId,
      input: { jobId, failUntilAttempt, payload: "billing-sync" },
      idempotencyKey: `recovery-${suffix}`,
    });
    const runId = created.run.id as RunId;
    await pollWithDeadline({
      description: `Run ${runId}`,
      read: () => client.runs.get(runId),
      isDone: (run) => TERMINAL_RUN.has(run.status),
      summarize: (run) => run.status,
      timeoutMs: optionalPositiveIntEnv("OSVA_RUN_TIMEOUT_MS", 120_000, env),
      intervalMs: optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env),
    });
    const listed = await client.runs.listAttempts(runId);
    const latestAttempt = listed.attempts.reduce<RunAttemptResourceV1 | undefined>((best, attempt) => {
      if (best === undefined || attempt.sequence > best.sequence) return attempt;
      return best;
    }, undefined);
    if (latestAttempt === undefined) throw new Error(`Run ${runId} has no attempts.`);
    const finalAttempt = TERMINAL_ATTEMPT.has(latestAttempt.status)
      ? latestAttempt
      : (
          await pollWithDeadline<RunAttemptResourceV1>({
            description: `RunAttempt ${latestAttempt.id}`,
            read: () => client.runs.getAttempt(runId, latestAttempt.id),
            isDone: (attempt) => TERMINAL_ATTEMPT.has(attempt.status),
            summarize: (attempt) => attempt.status,
            timeoutMs: optionalPositiveIntEnv("OSVA_RUN_TIMEOUT_MS", 120_000, env),
            intervalMs: optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env),
          })
        ).value;
    return {
      agentId: agent.id,
      agentVersionId: agentVersion.id,
      runId,
      manifestMaxAttempts: manifest.execution.maxAttempts,
      attemptCount: listed.attempts.length,
      attempts: listed.attempts.map((attempt) => ({
        id: attempt.id,
        sequence: attempt.sequence,
        status: attempt.status,
      })),
      finalAttemptStatus: finalAttempt.status,
      ...(finalAttempt.output === undefined ? {} : { output: finalAttempt.output }),
    };
  } finally {
    await services.close();
  }
}
