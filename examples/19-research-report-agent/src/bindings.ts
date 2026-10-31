export const MODEL_BINDING_RESEARCH = "research_model" as const;

export const TOOL_BINDING_NPM_PACKAGE_METADATA = "npm_package_metadata" as const;
export const TOOL_BINDING_NPM_DOWNLOADS = "npm_downloads" as const;

export const FIXTURE_PACKAGE_NAME = "osva-examples-fixture-research" as const;

/** Run input key used by EvaluationSuite cases for platform JSON_EXACT_MATCH runs. */
export const EVALUATION_FIXTURE_RUN_KEY = "evaluation-fixture" as const;

/** Stable artifact reference for evaluation-fixture runs (no live artifact persistence). */
export const EVALUATION_FIXTURE_ARTIFACT_ID = "artifact_eval_fixture" as const;

export function toolIdempotencyKey(runKey: string, tool: "npm_package_metadata" | "npm_downloads"): string {
  return `examples-19:${runKey}:${tool}`;
}

export function reportArtifactIdempotencyKey(runKey: string, packageName: string): string {
  return `examples-19:report:${runKey}:${packageName}`;
}
