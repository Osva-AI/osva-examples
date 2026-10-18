import { randomUUID } from "node:crypto";

import type { AgentId, AgentVersionId, RunAttemptResourceV1 } from "@osva-ai/contracts";
import { OsvaClient } from "@osva-ai/sdk";
import { optionalPositiveIntEnv, pollWithDeadline, requireEnv } from "@osva-examples/utils";

import { resetFixtureWrites } from "./connector.js";
import { buildAgentManifest } from "./runtime.js";
import { startExampleServices } from "./services.js";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]);

export async function runGitHubAutomationExample(env: NodeJS.ProcessEnv = process.env) {
  resetFixtureWrites();
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const runtimeUrl = requireEnv("OSVA_AGENT_RUNTIME_URL", env);
  const host = env.OSVA_EXAMPLE_LISTEN_HOST?.trim() || "127.0.0.1";
  const runtimePort = optionalPositiveIntEnv("OSVA_EXAMPLE_RUNTIME_PORT", 8798, env);
  const mode = env.OSVA_GITHUB_MODE?.trim().toLowerCase() === "live" ? "live" : "fixture";
  const approval =
    env.OSVA_GITHUB_APPROVAL?.trim().toLowerCase() === "reject"
      ? "reject"
      : env.OSVA_GITHUB_APPROVAL?.trim().toLowerCase() === "approve"
        ? "approve"
        : "pending";
  const issueNumber = optionalPositiveIntEnv("OSVA_EXAMPLE_ISSUE_NUMBER", 42, env);
  const suffix = (env.OSVA_EXAMPLE_KEY_SUFFIX?.trim() || randomUUID().slice(0, 8)).toLowerCase();

  const services = await startExampleServices({ host, runtimePort });
  try {
    const client = new OsvaClient({ baseUrl, apiKey });
    const agent = await client.agents.create({
      key: `examples-github-automation-${suffix}`,
      name: `Examples GitHub Automation ${suffix}`,
    });
    const agentVersion = await client.agents.createVersion(agent.id, {
      manifest: buildAgentManifest(runtimeUrl),
    });
    const created = await client.runs.create({
      agentId: agent.id as AgentId,
      agentVersionId: agentVersion.id as AgentVersionId,
      input: { mode, issueNumber, approval },
    });
    const polled = await pollWithDeadline<RunAttemptResourceV1>({
      description: `RunAttempt ${created.runAttempt.id}`,
      read: () => client.runs.getAttempt(created.run.id, created.runAttempt.id),
      isDone: (attempt) => TERMINAL.has(attempt.status),
      summarize: (attempt) => attempt.status,
      timeoutMs: optionalPositiveIntEnv("OSVA_RUN_TIMEOUT_MS", 60_000, env),
      intervalMs: optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env),
    });
    return {
      mode,
      approval,
      runId: created.run.id,
      attemptStatus: polled.value.status,
      ...(polled.value.output === undefined ? {} : { output: polled.value.output }),
    };
  } finally {
    await services.close();
  }
}
