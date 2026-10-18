import { defineConnector, defineTool } from "@osva-ai/connector-sdk";

import { normalizePageSnapshot, resolveFixturePage } from "./fixtures.js";

export async function executeFetchPage(input: unknown): Promise<{ page: ReturnType<typeof normalizePageSnapshot> }> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("url must be a string");
  }
  const url = (input as Record<string, unknown>)["url"];
  if (typeof url !== "string" || url.trim().length === 0) {
    throw new Error("url must be a string");
  }
  process.stderr.write(`${JSON.stringify({ event: "mcp.fetch_page.invoked", url })}\n`);
  const page = resolveFixturePage(url.trim());
  return { page: normalizePageSnapshot(page) };
}

export const fetchPageTool = defineTool({
  name: "fetch_page",
  description:
    "Returns a normalized page snapshot from deterministic local fixtures. " +
    "Swap this handler for a real crawler in production integrations.",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
    additionalProperties: false,
  },
  handler: executeFetchPage,
});

export const pageInspectorConnector = defineConnector({
  key: "osva-examples-page-inspector",
  name: "OSVA Examples Page Inspector",
  description: "Fixture-backed page inspection capability for the SEO worker example.",
  version: "1.0.0",
  tools: [fetchPageTool],
});
