import { randomUUID } from "node:crypto";

import type { AgentId, AgentVersionId, RunAttemptResourceV1 } from "@osva-ai/contracts";
import { OsvaClient } from "@osva-ai/sdk";
import { optionalPositiveIntEnv, pollWithDeadline, requireEnv } from "@osva-examples/utils";

import { buildScheduleRequest, validateCronExpression } from "./schedule-config.js";
import { buildAgentManifest } from "./runtime.js";
import { startExampleServices } from "./services.js";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]);

export interface ScheduledReportingResult {
  readonly scheduleId: string;
  readonly scheduleEnabled: boolean;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly demoRunId: string;
  readonly demoAttemptStatus: string;
  readonly demoOutput?: unknown;
}

export async function runScheduledReportingExample(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ScheduledReportingResult> {
  const baseUrl = requireEnv("OSVA_BASE_URL", env);
  const apiKey = requireEnv("OSVA_API_KEY", env);
  const runtimeUrl = requireEnv("OSVA_AGENT_RUNTIME_URL", env);
  const host = env.OSVA_EXAMPLE_LISTEN_HOST?.trim() || "127.0.0.1";
  const runtimePort = optionalPositiveIntEnv("OSVA_EXAMPLE_RUNTIME_PORT", 8796, env);
  const cronExpression = validateCronExpression(env.OSVA_SCHEDULE_CRON?.trim() || "0 9 * * 1");
  const timezone = env.OSVA_SCHEDULE_TIMEZONE?.trim() || "UTC";
  const enabled = env.OSVA_SCHEDULE_ENABLED?.trim().toLowerCase() === "true";
  const period = env.OSVA_REPORT_PERIOD?.trim() || new Date().toISOString().slice(0, 10);
  const suffix = (env.OSVA_EXAMPLE_KEY_SUFFIX?.trim() || randomUUID().slice(0, 8)).toLowerCase();

  const services = await startExampleServices({ host, runtimePort });
  try {
    const client = new OsvaClient({ baseUrl, apiKey });
    const agent = await client.agents.create({
      key: `examples-scheduled-report-${suffix}`,
      name: `Examples Scheduled Report ${suffix}`,
    });
    const agentVersion = await client.agents.createVersion(agent.id, {
      manifest: buildAgentManifest(runtimeUrl),
    });

    const schedule = await client.schedules.create(
      buildScheduleRequest({
        key: `examples-ops-report-${suffix}`,
        name: `Examples Ops Report ${suffix}`,
        agentId: agent.id as AgentId,
        agentVersionId: agentVersion.id as AgentVersionId,
        cronExpression,
        timezone,
        enabled,
        input: { period },
      }),
    );

    const demo = await client.runs.create({
      agentId: agent.id as AgentId,
      agentVersionId: agentVersion.id as AgentVersionId,
      input: { period },
      idempotencyKey: `demo-report-${suffix}`,
    });
    const polled = await pollWithDeadline<RunAttemptResourceV1>({
      description: `RunAttempt ${demo.runAttempt.id}`,
      read: () => client.runs.getAttempt(demo.run.id, demo.runAttempt.id),
      isDone: (attempt) => TERMINAL.has(attempt.status),
      summarize: (attempt) => attempt.status,
      timeoutMs: optionalPositiveIntEnv("OSVA_RUN_TIMEOUT_MS", 60_000, env),
      intervalMs: optionalPositiveIntEnv("OSVA_POLL_INTERVAL_MS", 500, env),
    });

    return {
      scheduleId: schedule.id,
      scheduleEnabled: enabled,
      agentId: agent.id,
      agentVersionId: agentVersion.id,
      demoRunId: demo.run.id,
      demoAttemptStatus: polled.value.status,
      ...(polled.value.output === undefined ? {} : { demoOutput: polled.value.output }),
    };
  } finally {
    await services.close();
  }
}
