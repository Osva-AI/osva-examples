import { describe, expect, it } from "vitest";

import { assertStructuredBriefOutput } from "../src/agent-types.js";
import { buildDeterministicFixtureBrief } from "../src/fixtures.js";

describe("smoke", () => {
  it("fixture brief satisfies structured output contract", () => {
    const brief = buildDeterministicFixtureBrief("2025-06-01", "2025-06-30");
    const structured = assertStructuredBriefOutput({
      ...brief,
      startDate: "2025-06-01",
      endDate: "2025-06-30",
      ga4PropertyId: "fixture-property-424242",
      analysisTimestamp: new Date(0).toISOString(),
      runKey: "evaluation-fixture",
    });
    expect(structured.observations.length).toBeGreaterThan(0);
  });
});
