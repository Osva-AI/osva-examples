import type { AgentId, AgentVersionId } from "@osva-ai/contracts";

export interface ScheduleDemoConfig {
  readonly key: string;
  readonly name: string;
  readonly agentId: AgentId;
  readonly agentVersionId: AgentVersionId;
  readonly cronExpression: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly input: { readonly period: string };
}

const CRON_PATTERN = /^[^\s]+ [^\s]+ [^\s]+ [^\s]+ [^\s]+$/;

export function validateCronExpression(cronExpression: string): string {
  const trimmed = cronExpression.trim();
  if (!CRON_PATTERN.test(trimmed)) {
    throw new Error("Cron expression must contain five whitespace-separated fields.");
  }
  if (trimmed.split(/\s+/).every((field) => field === "*")) {
    throw new Error("Refusing every-minute cron for the demo; use a weekly/daily pattern.");
  }
  return trimmed;
}

export function buildScheduleRequest(config: ScheduleDemoConfig) {
  return {
    key: config.key,
    name: config.name,
    agentId: config.agentId,
    agentVersionId: config.agentVersionId,
    cronExpression: validateCronExpression(config.cronExpression),
    timezone: config.timezone,
    input: config.input,
    enabled: config.enabled,
  };
}
