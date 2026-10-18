import { defineConnector, defineTool } from "@osva-ai/connector-sdk";

import { normalizeResearchSources, searchFixtureSources } from "./fixtures.js";

export async function executeSearchSources(
  input: unknown,
): Promise<{ sources: ReturnType<typeof searchFixtureSources> }> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("query must be a string");
  }
  const query = (input as Record<string, unknown>)["query"];
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("query must be a string");
  }
  process.stderr.write(`${JSON.stringify({ event: "mcp.search_sources.invoked", query: query.trim() })}\n`);
  const sources = searchFixtureSources(query.trim());
  return { sources: sources.map((source) => ({ ...source })) };
}

export const searchSourcesTool = defineTool({
  name: "search_sources",
  description:
    "Returns matching research sources from a deterministic local corpus. " +
    "Replace with live search or document connectors in production.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
    additionalProperties: false,
  },
  handler: executeSearchSources,
});

export const researchSourceConnector = defineConnector({
  key: "osva-examples-research-sources",
  name: "OSVA Examples Research Sources",
  description: "Fixture-backed research source collection for the research analyst worker example.",
  version: "1.0.0",
  tools: [searchSourcesTool],
});

export function extractSourcesFromToolResult(raw: unknown): ReturnType<typeof normalizeResearchSources> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("search_sources tool returned a non-object result.");
  }
  const sources = (raw as Record<string, unknown>)["sources"];
  if (sources === undefined) {
    throw new Error("search_sources tool result is missing sources.");
  }
  if (!Array.isArray(sources)) {
    throw new Error("search_sources tool result sources must be an array.");
  }
  return normalizeResearchSources(sources);
}
