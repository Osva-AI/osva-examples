import type { AgentId, AgentVersionId, RunAttemptResourceV1 } from "@osva-ai/contracts";
import { OsvaClient } from "@osva-ai/sdk";
import { optionalPositiveIntEnv, parseJsonEnv, pollWithDeadline, requireEnv } from "@osva-examples/utils";

const TERMINAL_ATTEMPTS = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]);

export interface MinimalAgentResult {
  readonly runId: string;
  readonly runStatus: string;
  readonly runAttemptId: string;
  readonly attemptStatus: string;
  readonly output?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
  readonly polling: { readonly attempts: number; readonly elapsedMs: number };
}

export async function runMinimalAgent(env: NodeJS.ProcessEnv = process.env): Promise<MinimalAgentResult> {
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const agentId = requireEnv("OSVA_AGENT_ID", env) as AgentId;
  const agentVersionId = requireEnv("OSVA_AGENT_VERSION_ID", env) as AgentVersionId;
  const input = parseJsonEnv("OSVA_RUN_INPUT", { message: "Hello from osva-examples" }, env);
  const timeoutMs = optionalPositiveIntEnv("OSVA_RUN_TIMEOUT_MS", 60_000, env);
  const intervalMs = optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env);

  const client = new OsvaClient({ baseUrl, apiKey });
  const created = await client.runs.create({ agentId, agentVersionId, input });
  const polled = await pollWithDeadline<RunAttemptResourceV1>({
    description: `RunAttempt ${created.runAttempt.id}`,
    read: () => client.runs.getAttempt(created.run.id, created.runAttempt.id),
    isDone: (attempt) => TERMINAL_ATTEMPTS.has(attempt.status),
    summarize: (attempt) => attempt.status,
    timeoutMs,
    intervalMs,
  });
  const run = await client.runs.get(created.run.id);

  return {
    runId: run.id,
    runStatus: run.status,
    runAttemptId: polled.value.id,
    attemptStatus: polled.value.status,
    ...(polled.value.output === undefined ? {} : { output: polled.value.output }),
    ...(polled.value.error === undefined ? {} : { error: polled.value.error }),
    polling: { attempts: polled.attempts, elapsedMs: polled.elapsedMs },
  };
}
