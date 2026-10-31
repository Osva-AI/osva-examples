import { describe, expect, it, vi } from "vitest";

import { runResearchReportAgent } from "../src/agent.js";
import { FIXTURE_PACKAGE_NAME } from "../src/bindings.js";
import { parseResearchSynthesis } from "../src/agent-types.js";
import {
  assertEvaluationFixtureOutputMatches,
  assertFixtureOutputMatchesEvaluation,
  buildDeterministicEvaluationExpectedOutput,
  buildDeterministicEvaluationExpectedSummary,
} from "../src/evaluation.js";
import { EVALUATION_FIXTURE_RUN_KEY } from "../src/bindings.js";
import { parseResearchReportInput } from "../src/agent-types.js";
import { renderResearchReportMarkdown } from "../src/report.js";
import { FIXTURE_PACKAGE_METADATA } from "../src/fixtures.js";

describe("research report agent (deterministic fixture)", () => {
  it("runs fixture package without MCP or model calls", async () => {
    const invoke = vi.fn();
    const generateText = vi.fn();
    const create = vi.fn().mockResolvedValue({
      reference: { type: "artifact", artifactId: "artifact_fixture" },
      name: `research-report-${FIXTURE_PACKAGE_NAME}.md`,
      mediaType: "text/markdown",
    });

    const output = await runResearchReportAgent({
      input: { packageName: FIXTURE_PACKAGE_NAME, includeDownloads: true, runKey: "test" },
      tools: { invoke },
      models: { generateText },
      artifacts: { create },
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(output.findingsCount).toBe(2);
    expect(output.report.artifactId).toBe("artifact_fixture");
    assertFixtureOutputMatchesEvaluation(output);
  });

  it("parses model synthesis JSON", () => {
    const synthesis = parseResearchSynthesis(
      '{"findings":["a"],"concerns":[],"assessment":"ok","disposition":"informational"}',
    );
    expect(synthesis.disposition).toBe("informational");
  });

  it("renders markdown with attribution sections", () => {
    const markdown = renderResearchReportMarkdown({
      packageName: "lodash",
      researchTimestamp: "2020-01-01T00:00:00.000Z",
      metadata: FIXTURE_PACKAGE_METADATA,
      synthesis: {
        findings: ["MIT licensed"],
        concerns: [],
        assessment: "Looks fine for demo.",
        disposition: "informational",
      },
      sources: { npmRegistry: true, npmDownloads: false },
    });
    expect(markdown).toContain("# npm research report: lodash");
    expect(markdown).toContain("## Sources");
    expect(markdown).not.toMatch(/sk-[A-Za-z0-9]/);
  });

  it("matches deterministic evaluation expectation shape", () => {
    expect(buildDeterministicEvaluationExpectedSummary()).toMatchObject({
      packageName: FIXTURE_PACKAGE_NAME,
      findingsCount: 2,
    });
  });

  it("returns stable full output for evaluation-fixture runs (platform JSON_EXACT_MATCH)", async () => {
    const create = vi.fn();
    const output = await runResearchReportAgent({
      input: {
        packageName: FIXTURE_PACKAGE_NAME,
        includeDownloads: true,
        runKey: EVALUATION_FIXTURE_RUN_KEY,
      },
      tools: { invoke: vi.fn() },
      models: { generateText: vi.fn() },
      artifacts: { create },
    });
    expect(create).not.toHaveBeenCalled();
    assertEvaluationFixtureOutputMatches(output);
    expect(JSON.stringify(output)).toBe(JSON.stringify(buildDeterministicEvaluationExpectedOutput()));
  });

  it("rejects invalid run input", () => {
    expect(() => parseResearchReportInput({ packageName: "" })).toThrow(/non-empty/);
    expect(() => parseResearchReportInput({ packageName: 1 })).toThrow(/non-empty/);
    expect(() => parseResearchReportInput(null)).toThrow(/object/);
  });
});
