import type { AgentVersionId, EvaluationSuiteVersionId, JsonObject } from "@osva-ai/contracts";
import type { OsvaClient } from "@osva-ai/sdk";

import { toEvaluationSummary } from "./agent-types.js";
import type { ResearchReportStructuredOutput } from "./agent-types.js";
import { EVALUATION_FIXTURE_RUN_KEY, FIXTURE_PACKAGE_NAME } from "./bindings.js";
import { FIXTURE_RESEARCH_TIMESTAMP, buildDeterministicFixtureAgentOutput } from "./fixtures.js";

export const DETERMINISTIC_EVALUATION_CASE_KEY = "fixture-package-summary";

export function buildDeterministicEvaluationExpectedSummary(): JsonObject {
  return {
    packageName: FIXTURE_PACKAGE_NAME,
    researchTimestamp: FIXTURE_RESEARCH_TIMESTAMP,
    disposition: "informational",
    findingsCount: 2,
    sources: { npmRegistry: true, npmDownloads: true },
    report: {
      type: "artifact",
      name: `research-report-${FIXTURE_PACKAGE_NAME}.md`,
      mediaType: "text/markdown",
    },
  };
}

export function buildDeterministicEvaluationCase() {
  const expected = buildDeterministicEvaluationExpectedOutput();
  return {
    key: DETERMINISTIC_EVALUATION_CASE_KEY,
    name: "Fixture package structured output (platform JSON_EXACT_MATCH)",
    input: {
      packageName: FIXTURE_PACKAGE_NAME,
      includeDownloads: true,
      runKey: EVALUATION_FIXTURE_RUN_KEY,
    },
    evaluator: {
      type: "JSON_EXACT_MATCH" as const,
      expected,
    },
  };
}

/** Full run output matched by OSVA `JSON_EXACT_MATCH` (stable; no live artifact id). */
export function buildDeterministicEvaluationExpectedOutput(): JsonObject {
  return JSON.parse(JSON.stringify(buildDeterministicFixtureAgentOutput())) as JsonObject;
}

export function assertEvaluationFixtureOutputMatches(output: ResearchReportStructuredOutput): void {
  const expected = buildDeterministicFixtureAgentOutput();
  if (JSON.stringify(output) !== JSON.stringify(expected)) {
    throw new Error("Evaluation-fixture run output did not match the deterministic platform expectation.");
  }
}

export function assertFixtureOutputMatchesEvaluation(output: ResearchReportStructuredOutput): void {
  const summary = toEvaluationSummary(output);
  const expected = buildDeterministicEvaluationExpectedSummary();
  if (JSON.stringify(summary) !== JSON.stringify(expected)) {
    throw new Error("Fixture run output did not match deterministic evaluation expectation.");
  }
}

export async function runDeterministicEvaluation(
  client: OsvaClient,
  agentVersionId: AgentVersionId,
  suffix: string,
): Promise<{
  readonly evaluationSuiteId: string;
  readonly evaluationSuiteVersionId: EvaluationSuiteVersionId;
  readonly evaluationRunId: string;
  readonly passed: boolean;
}> {
  const suite = await client.evaluationSuites.create({
    key: `examples-research-eval-${suffix}`,
    name: `Examples Research Eval ${suffix}`,
    description: "Deterministic fixture evaluation for example 19.",
  });

  const suiteVersion = await client.evaluationSuites.createVersion(suite.id, {
    cases: [buildDeterministicEvaluationCase()],
  });

  const evaluationRun = await client.evaluationRuns.create({
    evaluationSuiteVersionId: suiteVersion.id,
    targetType: "AGENT_VERSION",
    targetVersionId: agentVersionId,
  });

  const terminal = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
  let detail = evaluationRun;
  for (let attempt = 0; attempt < 120 && !terminal.has(detail.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    detail = await client.evaluationRuns.get(evaluationRun.id);
  }

  const caseResults = await client.evaluationRuns.listCaseResults(evaluationRun.id);
  const passed = detail.status === "COMPLETED" && caseResults.items.every((item) => item.outcome === "PASS");

  return {
    evaluationSuiteId: suite.id,
    evaluationSuiteVersionId: suiteVersion.id,
    evaluationRunId: evaluationRun.id,
    passed,
  };
}
