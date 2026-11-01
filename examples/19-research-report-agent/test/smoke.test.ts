import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { EVALUATION_FIXTURE_RUN_KEY } from "../src/bindings.js";
import { buildDeterministicEvaluationCase, buildDeterministicEvaluationExpectedOutput } from "../src/evaluation.js";

/** Mirrors `runResearchReportExample` suffix selection in `src/app.ts`. */
function resolveRunSuffix(env: NodeJS.ProcessEnv): string {
  return (env.OSVA_EXAMPLE_KEY_SUFFIX?.trim() || randomUUID().slice(0, 8)).toLowerCase();
}

describe("example 19 smoke contracts", () => {
  it("reuses OSVA_EXAMPLE_KEY_SUFFIX across invocations when set", () => {
    const env = { OSVA_EXAMPLE_KEY_SUFFIX: "PinnedSuffix" };
    expect(resolveRunSuffix(env)).toBe("pinnedsuffix");
    expect(resolveRunSuffix(env)).toBe("pinnedsuffix");
  });

  it("derives different suffixes on successive default invocations", () => {
    const first = resolveRunSuffix({});
    const second = resolveRunSuffix({});
    expect(first).toMatch(/^[0-9a-f]{8}$/);
    expect(second).toMatch(/^[0-9a-f]{8}$/);
    expect(first).not.toBe(second);
  });

  it("defines a JSON_EXACT_MATCH evaluation case for the fixture package", () => {
    const evaluationCase = buildDeterministicEvaluationCase();
    expect(evaluationCase.evaluator.type).toBe("JSON_EXACT_MATCH");
    expect(evaluationCase.input).toMatchObject({
      packageName: "osva-examples-fixture-research",
      runKey: EVALUATION_FIXTURE_RUN_KEY,
    });
    expect(evaluationCase.evaluator.expected).toEqual(buildDeterministicEvaluationExpectedOutput());
  });
});
