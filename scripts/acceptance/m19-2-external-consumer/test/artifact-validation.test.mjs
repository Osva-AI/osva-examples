import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateResearchReportMarkdown } from "../lib/artifact-validation.mjs";

describe("artifact markdown validation", () => {
  it("accepts a minimal valid research report", () => {
    const markdown = [
      "# npm research report: lodash",
      "",
      "## Key findings",
      "",
      "- a",
      "",
      "## Overall assessment",
      "",
      "ok",
    ].join("\n");
    const result = validateResearchReportMarkdown(markdown, "lodash");
    assert.equal(result.ok, true);
  });

  it("rejects empty content", () => {
    const result = validateResearchReportMarkdown("   ");
    assert.equal(result.ok, false);
  });
});
