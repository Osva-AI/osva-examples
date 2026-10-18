import type { JsonValue, ToolVersionId } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";
import { isJsonRecord } from "@osva-examples/utils";

export const TOOL_BINDING = "text_tool";

export const toolAgentRuntime = createRuntime({
  execute: async (input, context) => {
    const text = extractText(input);
    const toolResult = await context.tools.invoke({
      binding: TOOL_BINDING,
      input: { text },
    });
    return { input: text, toolResult };
  },
});

export function extractText(input: JsonValue): string {
  if (!isJsonRecord(input)) {
    throw new Error("Run input must be an object with a string 'text' property.");
  }
  const text = input["text"];
  if (typeof text !== "string") {
    throw new Error("Run input must include a string 'text' property.");
  }
  return text;
}

export function buildAgentManifest(runtimeUrl: string, toolVersionId: ToolVersionId) {
  return {
    schemaVersion: "1" as const,
    key: "mcp-tool-agent",
    name: "MCP Tool Agent",
    runtime: {
      type: "REMOTE_HTTP" as const,
      protocolVersion: "1" as const,
      endpoint: runtimeUrl,
      timeoutMs: 30_000,
    },
    input: {
      schema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
    },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 30_000, maxAttempts: 1 },
    capabilities: { model: false, tools: [TOOL_BINDING] },
    tools: { [TOOL_BINDING]: { toolVersionId } },
  };
}
