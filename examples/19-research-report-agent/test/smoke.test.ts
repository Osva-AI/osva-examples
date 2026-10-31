import { describe, expect, it } from "vitest";

import { EVALUATION_FIXTURE_RUN_KEY } from "../src/bindings.js";
import { buildDeterministicEvaluationCase, buildDeterministicEvaluationExpectedOutput } from "../src/evaluation.js";

describe("example 19 smoke contracts", () => {
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
