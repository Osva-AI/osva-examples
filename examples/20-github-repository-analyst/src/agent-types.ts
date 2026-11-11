import type { JsonValue } from "@osva-ai/contracts";
import { isJsonRecord } from "@osva-examples/utils";

import type { RepositoryBrief } from "./analysis.js";

export interface RepositoryAnalystStructuredOutput extends RepositoryBrief {
  readonly owner: string;
  readonly repo: string;
  readonly analysisTimestamp: string;
  readonly runKey: string;
}

export interface TrustedRepositoryAnalystContext {
  readonly input: JsonValue;
  readonly tools: {
    invoke(binding: string, input: unknown, options?: { readonly idempotencyKey?: string }): Promise<unknown>;
  };
}

export function assertStructuredBriefOutput(value: unknown): RepositoryAnalystStructuredOutput {
  if (!isJsonRecord(value as JsonValue)) {
    throw new Error("Agent output must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (typeof record["owner"] !== "string" || typeof record["repo"] !== "string") {
    throw new Error("Agent output must include owner and repo.");
  }
  if (!isJsonRecord(record["repository"] as JsonValue)) {
    throw new Error("Agent output must include repository object.");
  }
  if (!isJsonRecord(record["issueSummary"] as JsonValue)) {
    throw new Error("Agent output must include issueSummary object.");
  }
  if (
    !Array.isArray(record["themes"]) ||
    !Array.isArray(record["risks"]) ||
    !Array.isArray(record["recommendations"])
  ) {
    throw new Error("Agent output must include themes, risks, and recommendations arrays.");
  }
  return value as RepositoryAnalystStructuredOutput;
}
