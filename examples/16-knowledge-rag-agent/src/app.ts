import { randomUUID } from "node:crypto";

import type { AgentId, AgentVersionId, KnowledgeIndexId, RunAttemptResourceV1 } from "@osva-ai/contracts";
import { OsvaClient } from "@osva-ai/sdk";
import { optionalPositiveIntEnv, pollWithDeadline, requireEnv } from "@osva-examples/utils";

import { buildAgentManifest } from "./runtime.js";
import { startExampleServices } from "./services.js";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]);

export interface KnowledgeRagExampleResult {
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly knowledgeIndexId: string;
  readonly runId: string;
  readonly attemptStatus: string;
  readonly output?: unknown;
}

export async function runKnowledgeRagExample(env: NodeJS.ProcessEnv = process.env): Promise<KnowledgeRagExampleResult> {
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const runtimeUrl = requireEnv("OSVA_AGENT_RUNTIME_URL", env);
  const knowledgeIndexId = requireEnv("OSVA_KNOWLEDGE_INDEX_ID", env) as KnowledgeIndexId;
  const host = env.OSVA_EXAMPLE_LISTEN_HOST?.trim() || "127.0.0.1";
  const runtimePort = optionalPositiveIntEnv("OSVA_EXAMPLE_RUNTIME_PORT", 8797, env);
  const question = env.OSVA_EXAMPLE_QUESTION?.trim() || "What is the refund window for annual plans?";
  const suffix = (env.OSVA_EXAMPLE_KEY_SUFFIX?.trim() || randomUUID().slice(0, 8)).toLowerCase();

  const services = await startExampleServices({ host, runtimePort });
  try {
    const client = new OsvaClient({ baseUrl, apiKey });
    const agent = await client.agents.create({
      key: `examples-knowledge-rag-${suffix}`,
      name: `Examples Knowledge RAG ${suffix}`,
    });
    const agentVersion = await client.agents.createVersion(agent.id, {
      manifest: buildAgentManifest(runtimeUrl, knowledgeIndexId),
    });
    const created = await client.runs.create({
      agentId: agent.id as AgentId,
      agentVersionId: agentVersion.id as AgentVersionId,
      input: { question },
    });
    const polled = await pollWithDeadline<RunAttemptResourceV1>({
      description: `RunAttempt ${created.runAttempt.id}`,
      read: () => client.runs.getAttempt(created.run.id, created.runAttempt.id),
      isDone: (attempt) => TERMINAL.has(attempt.status),
      summarize: (attempt) => attempt.status,
      timeoutMs: optionalPositiveIntEnv("OSVA_RUN_TIMEOUT_MS", 120_000, env),
      intervalMs: optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env),
    });
    return {
      agentId: agent.id,
      agentVersionId: agentVersion.id,
      knowledgeIndexId,
      runId: created.run.id,
      attemptStatus: polled.value.status,
      ...(polled.value.output === undefined ? {} : { output: polled.value.output }),
    };
  } finally {
    await services.close();
  }
}
