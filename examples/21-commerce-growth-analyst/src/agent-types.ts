import type { JsonValue } from "@osva-ai/contracts";
import { isJsonRecord } from "@osva-examples/utils";

import type { CommerceGrowthBrief } from "./analysis.js";

export interface CommerceGrowthStructuredOutput extends CommerceGrowthBrief {
  readonly startDate: string;
  readonly endDate: string;
  readonly ga4PropertyId: string;
  readonly analysisTimestamp: string;
  readonly runKey: string;
}

export interface TrustedCommerceGrowthContext {
  readonly input: JsonValue;
  readonly tools: {
    invoke(binding: string, input: unknown, options?: { readonly idempotencyKey?: string }): Promise<unknown>;
  };
}

export function assertStructuredBriefOutput(value: unknown): CommerceGrowthStructuredOutput {
  if (!isJsonRecord(value as JsonValue)) {
    throw new Error("Agent output must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (typeof record["startDate"] !== "string" || typeof record["endDate"] !== "string") {
    throw new Error("Agent output must include startDate and endDate.");
  }
  if (!isJsonRecord(record["period"] as JsonValue)) {
    throw new Error("Agent output must include period object.");
  }
  if (!isJsonRecord(record["commerce"] as JsonValue) || !isJsonRecord(record["acquisition"] as JsonValue)) {
    throw new Error("Agent output must include commerce and acquisition objects.");
  }
  for (const key of ["observations", "opportunities", "risks", "recommendations", "evidence", "limitations"] as const) {
    if (!Array.isArray(record[key])) {
      throw new Error(`Agent output must include ${key} array.`);
    }
  }
  return value as CommerceGrowthStructuredOutput;
}
