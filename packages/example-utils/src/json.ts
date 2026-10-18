import type { JsonObject, JsonValue } from "@osva-ai/contracts";

/** Narrows canonical JSON values to plain objects (excludes arrays and null). */
export function isJsonRecord(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
