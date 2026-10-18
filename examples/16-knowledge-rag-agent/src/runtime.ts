import type { JsonObject, JsonValue, KnowledgeIndexId } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";
import { isJsonRecord } from "@osva-examples/utils";

export const KNOWLEDGE_BINDING = "product_docs";

export function parseQuestion(input: JsonValue): string {
  if (!isJsonRecord(input)) throw new Error("Run input must be an object.");
  const question = input["question"];
  if (typeof question !== "string" || question.trim().length === 0) {
    throw new Error("Run input must include a non-empty question.");
  }
  return question.trim();
}

export interface RetrievedKnowledgeHit {
  readonly knowledgeChunkId: string;
  readonly knowledgeIndexId: string;
  readonly text: string;
  readonly score: number;
}

export function buildAnswer(question: string, hits: readonly RetrievedKnowledgeHit[]): JsonObject {
  if (hits.length === 0) {
    return JSON.parse(
      JSON.stringify({
        question,
        answer: "I do not have enough indexed evidence to answer that question.",
        sources: [],
        supported: false,
      }),
    ) as JsonObject;
  }
  const top = hits.slice(0, 3);
  const summary = top.map((hit) => hit.text).join(" ");
  return JSON.parse(
    JSON.stringify({
      question,
      answer: `Based on retrieved documentation: ${summary}`,
      sources: top.map((hit) => ({
        knowledgeChunkId: hit.knowledgeChunkId,
        knowledgeIndexId: hit.knowledgeIndexId,
        score: hit.score,
        excerpt: hit.text.slice(0, 160),
      })),
      supported: true,
      binding: KNOWLEDGE_BINDING,
    }),
  ) as JsonObject;
}

export const knowledgeRagRuntime = createRuntime({
  execute: async (input, context) => {
    const question = parseQuestion(input);
    const hits = await context.knowledge.search({ binding: KNOWLEDGE_BINDING, query: question, topK: 5 });
    return buildAnswer(question, hits);
  },
});

export function buildAgentManifest(runtimeUrl: string, knowledgeIndexId: KnowledgeIndexId) {
  return {
    schemaVersion: "1" as const,
    key: "knowledge-rag-agent",
    name: "Knowledge RAG Agent",
    runtime: { type: "REMOTE_HTTP" as const, protocolVersion: "1" as const, endpoint: runtimeUrl, timeoutMs: 45_000 },
    input: {
      schema: {
        type: "object",
        properties: { question: { type: "string", minLength: 1 } },
        required: ["question"],
        additionalProperties: false,
      },
    },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 45_000, maxAttempts: 1 },
    capabilities: { model: false, tools: [] as string[] },
    knowledge: { [KNOWLEDGE_BINDING]: { knowledgeIndexIds: [knowledgeIndexId] } },
  };
}
