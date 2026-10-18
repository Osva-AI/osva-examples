import type { GrowthObjective, GrowthWorkerInput, GrowthWorkerRequest } from "./types.js";

export const DEFAULT_BUSINESS_ID = "northpeak-outdoors";

const OBJECTIVES: readonly GrowthObjective[] = ["conversion", "retention", "revenue", "activation", "overall-growth"];

export function validateGrowthWorkerInput(raw: unknown): GrowthWorkerInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Growth worker input must be an object.");
  }
  const record = raw as Record<string, unknown>;
  const businessId = readRequiredString(record["businessId"], "businessId");
  if (businessId.length < 2 || businessId.length > 80) {
    throw new Error("businessId must be between 2 and 80 characters.");
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(businessId)) {
    throw new Error("businessId must use lowercase letters, numbers, and hyphens.");
  }

  const objectiveRaw = record["objective"];
  let objective: GrowthObjective | undefined;
  if (objectiveRaw !== undefined && objectiveRaw !== null) {
    if (typeof objectiveRaw !== "string" || !OBJECTIVES.includes(objectiveRaw as GrowthObjective)) {
      throw new Error(`objective must be one of: ${OBJECTIVES.join(", ")}.`);
    }
    objective = objectiveRaw as GrowthObjective;
  }

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
    ...(objective === undefined ? {} : { objective }),
    ...(context === undefined ? {} : { context }),
  };
}

export function buildGrowthWorkerRequest(input: GrowthWorkerInput, analysisId: string): GrowthWorkerRequest {
  return { analysisId, ...input };
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${field} must not be empty.`);
  }
  return trimmed;
}
