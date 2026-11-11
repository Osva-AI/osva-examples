import { describe, expect, it } from "vitest";

import { parseRepositoryAnalystInput } from "../src/input.js";

describe("parseRepositoryAnalystInput", () => {
  it("parses required fields", () => {
    const parsed = parseRepositoryAnalystInput({
      owner: "Osva-AI",
      repo: "osva",
      maxIssueSampleSize: 10,
    });
    expect(parsed.owner).toBe("Osva-AI");
    expect(parsed.issueState).toBe("open");
    expect(parsed.issuePageLimit).toBe(1);
  });

  it("rejects invalid slugs", () => {
    expect(() => parseRepositoryAnalystInput({ owner: "", repo: "x", maxIssueSampleSize: 1 })).toThrow();
    expect(() => parseRepositoryAnalystInput({ owner: "a", repo: "bad slug", maxIssueSampleSize: 1 })).toThrow();
  });

  it("bounds sample size", () => {
    expect(() => parseRepositoryAnalystInput({ owner: "a", repo: "b", maxIssueSampleSize: 0 })).toThrow(/between/);
    expect(() => parseRepositoryAnalystInput({ owner: "a", repo: "b", maxIssueSampleSize: 500 })).toThrow(/between/);
  });
});
