import type { FoundersOfficeInput, FoundersOfficeRequest } from "./types.js";

export const DEFAULT_COMPANY_ID = "atlas-runtime";
export const DEFAULT_FOUNDERS_OBJECTIVE = "Improve growth while keeping execution risks under control";

export function validateFoundersOfficeInput(raw: unknown): FoundersOfficeInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Founder's office input must be an object.");
  }
  const record = raw as Record<string, unknown>;
  const companyId = readRequiredString(record["companyId"], "companyId");
  if (companyId.length < 2 || companyId.length > 80) {
    throw new Error("companyId must be between 2 and 80 characters.");
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(companyId)) {
    throw new Error("companyId must use lowercase letters, numbers, and hyphens.");
  }

  const objectiveRaw = record["objective"];
  let objective: string | undefined;
  if (objectiveRaw !== undefined && objectiveRaw !== null) {
    if (typeof objectiveRaw !== "string") {
      throw new Error("objective must be a string when provided.");
    }
    const trimmed = objectiveRaw.trim();
    if (trimmed.length > 300) {
      throw new Error("objective must be at most 300 characters.");
    }
    if (trimmed.length > 0) {
      objective = trimmed;
    }
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
    companyId,
    ...(objective === undefined ? {} : { objective }),
    ...(context === undefined ? {} : { context }),
  };
}

export function buildFoundersOfficeRequest(input: FoundersOfficeInput, briefId: string): FoundersOfficeRequest {
  return { briefId, ...input };
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
