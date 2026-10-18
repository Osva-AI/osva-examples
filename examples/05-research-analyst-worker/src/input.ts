import type { ResearchWorkerInput, ResearchWorkerRequest } from "./types.js";

const MIN_QUESTION_LENGTH = 12;
const MAX_QUESTION_LENGTH = 500;
const MAX_OPTIONAL_FIELD_LENGTH = 300;

export const DEFAULT_RESEARCH_QUESTION =
  "What are the main factors driving adoption of AI customer-support agents among mid-market SaaS companies?";

export function validateResearchWorkerInput(raw: unknown): ResearchWorkerInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Research worker input must be an object.");
  }
  const record = raw as Record<string, unknown>;
  const question = readBoundedString(record["question"], "question", MIN_QUESTION_LENGTH, MAX_QUESTION_LENGTH);
  const objective = readOptionalBoundedString(record["objective"], "objective");
  const audience = readOptionalBoundedString(record["audience"], "audience");
  return {
    question,
    ...(objective === undefined ? {} : { objective }),
    ...(audience === undefined ? {} : { audience }),
  };
}

export function buildResearchWorkerRequest(input: ResearchWorkerInput, researchId: string): ResearchWorkerRequest {
  return { researchId, ...input };
}

function readBoundedString(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new Error(`${field} must be at least ${min} characters.`);
  }
  if (trimmed.length > max) {
    throw new Error(`${field} must be at most ${max} characters.`);
  }
  return trimmed;
}

function readOptionalBoundedString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string when provided.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length > MAX_OPTIONAL_FIELD_LENGTH) {
    throw new Error(`${field} must be at most ${MAX_OPTIONAL_FIELD_LENGTH} characters.`);
  }
  return trimmed;
}
