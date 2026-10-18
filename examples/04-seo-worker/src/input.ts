import type { SeoWorkerInput, SeoWorkerRequest } from "./types.js";

export function validateSeoWorkerInput(raw: unknown): SeoWorkerInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("SEO worker input must be an object.");
  }
  const record = raw as Record<string, unknown>;
  const url = readRequiredString(record["url"], "url");
  const targetKeyword = readRequiredString(record["targetKeyword"], "targetKeyword");
  validateHttpUrl(url);
  if (targetKeyword.length < 2) {
    throw new Error("targetKeyword must be at least 2 characters.");
  }
  const businessContextRaw = record["businessContext"];
  let businessContext: string | undefined;
  if (businessContextRaw !== undefined && businessContextRaw !== null) {
    if (typeof businessContextRaw !== "string") {
      throw new Error("businessContext must be a string when provided.");
    }
    const trimmed = businessContextRaw.trim();
    if (trimmed.length > 0) {
      businessContext = trimmed;
    }
  }
  return { url, targetKeyword: targetKeyword.trim(), ...(businessContext === undefined ? {} : { businessContext }) };
}

export function buildSeoWorkerRequest(input: SeoWorkerInput, auditId: string): SeoWorkerRequest {
  return { auditId, ...input };
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

function validateHttpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("url must be a valid absolute URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("url must use http or https.");
  }
}
