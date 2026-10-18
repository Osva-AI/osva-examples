import { afterEach, describe, expect, it, vi } from "vitest";

import { CapabilityCredential, createRuntimeContext } from "@osva-ai/sdk/runtime";

import { KNOWLEDGE_BINDING, buildAgentManifest, buildAnswer, parseQuestion } from "../src/runtime.js";

const fetchMock = vi.fn<typeof fetch>();

afterEach(() => {
  fetchMock.mockReset();
});

describe("knowledge RAG agent contracts", () => {
  it("validates questions and manifest knowledge binding", () => {
    expect(parseQuestion({ question: "Refund policy?" })).toBe("Refund policy?");
    expect(() => parseQuestion({ question: "" })).toThrow(/non-empty/);
    const manifest = buildAgentManifest("http://127.0.0.1:8797/execute", "knowledge_index_test" as never);
    expect(manifest.knowledge?.[KNOWLEDGE_BINDING]?.knowledgeIndexIds).toEqual(["knowledge_index_test"]);
  });

  it("parses retrieval hits into source traceability", () => {
    const answer = buildAnswer("Refund?", [
      {
        knowledgeChunkId: "chunk_1",
        knowledgeIndexId: "index_1",
        text: "Annual refunds within 30 days.",
        score: 0.91,
      },
    ]);
    expect(answer["supported"]).toBe(true);
    expect(answer["sources"]).toHaveLength(1);
  });

  it("returns unsupported answer when retrieval is empty", () => {
    const answer = buildAnswer("Unknown?", []);
    expect(answer["supported"]).toBe(false);
    expect(answer["sources"]).toEqual([]);
  });

  it("posts knowledge search capability requests (offline mock)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          protocolVersion: "1",
          executionId: "exec_1",
          outcome: "SUCCEEDED",
          hits: [
            {
              knowledgeChunkId: "chunk_1",
              knowledgeIndexId: "index_1",
              knowledgeSourceId: "source_1",
              artifactReference: { type: "artifact", artifactId: "artifact_1" },
              text: "Annual refunds within 30 days.",
              score: 0.9,
              attributes: {},
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const context = createRuntimeContext({
      executionId: "exec_1",
      credential: new CapabilityCredential("http://capabilities.test", "token"),
      fetch: fetchMock,
    });
    const hits = await context.knowledge.search({ binding: KNOWLEDGE_BINDING, query: "refund" });
    expect(hits[0]?.text).toContain("30 days");
  });
});
