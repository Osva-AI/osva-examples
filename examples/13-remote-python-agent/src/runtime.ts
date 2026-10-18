import type { JsonValue } from "@osva-ai/contracts";
import { isJsonRecord } from "@osva-examples/utils";

export function extractText(input: JsonValue): string {
  if (!isJsonRecord(input)) {
    throw new Error("Run input must be an object with a string 'text' property.");
  }
  const text = input["text"];
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Run input must include a non-empty string 'text' property.");
  }
  return text;
}

export function buildAgentManifest(runtimeUrl: string) {
  return {
    schemaVersion: "1" as const,
    key: "remote-python-agent",
    name: "Remote Python Agent",
    runtime: {
      type: "REMOTE_HTTP" as const,
      protocolVersion: "1" as const,
      endpoint: runtimeUrl,
      timeoutMs: 30_000,
    },
    input: {
      schema: {
        type: "object",
        properties: { text: { type: "string", minLength: 1 } },
        required: ["text"],
        additionalProperties: false,
      },
    },
    output: {
      schema: {
        type: "object",
        properties: {
          input: { type: "string" },
          normalized: { type: "string" },
          runtimeLanguage: { type: "string" },
        },
        required: ["input", "normalized", "runtimeLanguage"],
        additionalProperties: false,
      },
    },
    execution: { timeoutMs: 30_000, maxAttempts: 1 },
    capabilities: { model: false, tools: [] as string[] },
  };
}
