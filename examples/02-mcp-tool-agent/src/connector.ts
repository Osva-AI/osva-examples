import { defineConnector, defineTool } from "@osva-ai/connector-sdk";

export async function executeNormalizeText(input: unknown): Promise<{ normalized: string }> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("text must be a string");
  }
  const text = (input as Record<string, unknown>)["text"];
  if (typeof text !== "string") {
    throw new Error("text must be a string");
  }
  process.stderr.write(`${JSON.stringify({ event: "mcp.normalize_text.invoked", characterCount: text.length })}\n`);
  return { normalized: text.trim().toUpperCase() };
}

export const normalizeTextTool = defineTool({
  name: "normalize_text",
  description: "Trims text and converts it to uppercase using deterministic local code.",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false,
  },
  handler: executeNormalizeText,
});

export const localMcpConnector = defineConnector({
  key: "osva-examples-normalize-text",
  name: "OSVA Examples Normalize Text",
  description: "Safe deterministic MCP capability used by the public examples repository.",
  version: "1.0.0",
  tools: [normalizeTextTool],
});
