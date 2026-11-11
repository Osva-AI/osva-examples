import { describe, expect, it } from "vitest";

import { buildDeterministicFixtureBrief } from "../src/fixtures.js";

describe("example 20 smoke", () => {
  it("produces structured brief shape", () => {
    const brief = buildDeterministicFixtureBrief();
    expect(brief.repository.fullName).toContain("osva-examples-fixture");
    expect(Array.isArray(brief.evidence)).toBe(true);
    expect(JSON.stringify(brief)).not.toMatch(/ghp_|github_pat_/i);
  });
});
