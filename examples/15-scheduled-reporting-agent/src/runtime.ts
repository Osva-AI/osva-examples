import type { JsonObject, JsonValue } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";
import { isJsonRecord } from "@osva-examples/utils";

import { collectFixtureMetrics } from "./metrics.js";
import { renderOperationalReport } from "./report.js";

export const reportingRuntime = createRuntime({
  execute: async (input, context) => {
    const period = parsePeriod(input);
    const metrics = collectFixtureMetrics(period);
    const markdown = renderOperationalReport(metrics);
    const artifact = await context.artifacts.create({
      name: `operational-report-${period.replace(/[^a-zA-Z0-9_-]+/g, "-")}.md`,
      mediaType: "text/markdown",
      content: new Blob([markdown], { type: "text/markdown" }),
      metadata: { example: "15-scheduled-reporting-agent" },
      idempotencyKey: `ops-report-${period}`,
    });
    const output: JsonObject = JSON.parse(
      JSON.stringify({
        period,
        metrics,
        report: {
          artifact: artifact.reference,
          name: artifact.name,
          mediaType: artifact.mediaType,
        },
      }),
    ) as JsonObject;
    return output;
  },
});

function parsePeriod(input: JsonValue): string {
  if (!isJsonRecord(input)) throw new Error("Run input must be an object.");
  const period = input["period"];
  if (typeof period !== "string" || period.trim().length === 0) {
    throw new Error("Run input must include a non-empty 'period' string.");
  }
  return period.trim();
}

export function buildAgentManifest(runtimeUrl: string) {
  return {
    schemaVersion: "1" as const,
    key: "scheduled-reporting-agent",
    name: "Scheduled Reporting Agent",
    runtime: { type: "REMOTE_HTTP" as const, protocolVersion: "1" as const, endpoint: runtimeUrl, timeoutMs: 30_000 },
    input: {
      schema: {
        type: "object",
        properties: { period: { type: "string", minLength: 1 } },
        required: ["period"],
        additionalProperties: false,
      },
    },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 30_000, maxAttempts: 1 },
    capabilities: { model: false, tools: [] as string[] },
  };
}
