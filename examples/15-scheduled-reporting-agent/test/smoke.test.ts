import { createScheduleRequestSchema } from "@osva-ai/contracts/schemas";
import { describe, expect, it } from "vitest";

import { collectFixtureMetrics } from "../src/metrics.js";
import { renderOperationalReport } from "../src/report.js";
import { buildScheduleRequest, validateCronExpression } from "../src/schedule-config.js";
import { buildAgentManifest } from "../src/runtime.js";

describe("scheduled reporting agent contracts", () => {
  it("validates schedule configuration and rejects rapid cron patterns", () => {
    expect(validateCronExpression("0 9 * * 1")).toBe("0 9 * * 1");
    expect(() => validateCronExpression("* * * * *")).toThrow(/every-minute/);
  });

  it("builds a schedule definition shape accepted by OSVA contracts", () => {
    const body = buildScheduleRequest({
      key: "demo",
      name: "Demo",
      agentId: "agent_1" as never,
      agentVersionId: "agent_version_1" as never,
      cronExpression: "0 9 * * 1",
      timezone: "UTC",
      enabled: false,
      input: { period: "2026-10-19" },
    });
    expect(() => createScheduleRequestSchema.parse(body)).not.toThrow();
    expect(body.enabled).toBe(false);
  });

  it("generates report markdown and artifact-oriented output fields", () => {
    const metrics = collectFixtureMetrics("2026-10-19");
    const markdown = renderOperationalReport(metrics);
    expect(markdown).toContain("Successful runs: 128");
    expect(markdown).toContain("Failed runs: 4");
  });

  it("binds a model-free REMOTE_HTTP manifest", () => {
    const manifest = buildAgentManifest("http://127.0.0.1:8796/execute");
    expect(manifest.capabilities.model).toBe(false);
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key/i);
  });
});
