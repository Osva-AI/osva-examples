import type { GrowthObjective, GrowthOpsWorkerInput, GrowthOpsWorkerRequest } from "./types.js";

export const DEFAULT_BUSINESS_ID = "northpeak-outdoors";
export const DEFAULT_GROWTH_OBJECTIVE: GrowthObjective = "improve-conversion";

const OBJECTIVES: readonly GrowthObjective[] = [
  "grow-revenue",
  "improve-conversion",
  "improve-retention",
  "reduce-acquisition-cost",
];

export function validateGrowthOpsWorkerInput(raw: unknown): GrowthOpsWorkerInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Growth operations input must be an object.");
  }
  const record = raw as Record<string, unknown>;
  const businessId = readRequiredString(record["businessId"], "businessId", 2, 80);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(businessId)) {
    throw new Error("businessId must use lowercase letters, numbers, and hyphens.");
  }
  const objectiveRaw = record["objective"];
  if (typeof objectiveRaw !== "string" || !OBJECTIVES.includes(objectiveRaw as GrowthObjective)) {
    throw new Error(`objective must be one of: ${OBJECTIVES.join(", ")}.`);
  }
  const objective = objectiveRaw as GrowthObjective;

  const contextRaw = record["context"];
  let context: string | undefined;
  if (contextRaw !== undefined && contextRaw !== null) {
    if (typeof contextRaw !== "string") {
      throw new Error("context must be a string when provided.");
    }
    const trimmed = contextRaw.trim();
    if (trimmed.length > 500) {
      throw new Error("context must be at most 500 characters.");
    }
    if (trimmed.length > 0) {
      context = trimmed;
    }
  }

  return {
    businessId,
    objective,
    ...(context === undefined ? {} : { context }),
  };
}

export function buildGrowthOpsWorkerRequest(input: GrowthOpsWorkerInput, runId: string): GrowthOpsWorkerRequest {
  return { runId, ...input };
}

function readRequiredString(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new Error(`${field} must be between ${min} and ${max} characters.`);
  }
  return trimmed;
}
