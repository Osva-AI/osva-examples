import type { JsonObject, JsonValue } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";
import { isJsonRecord } from "@osva-examples/utils";

type ReviewRequest = JsonObject & {
  readonly requestId: string;
  readonly subject: string;
  readonly question: string;
};

type ReviewEnvelope = JsonObject & {
  readonly request: ReviewRequest;
  readonly research?: JsonObject;
  readonly analysis?: JsonObject;
};

export const reviewRuntime = createRuntime({
  execute: async (input, context) => {
    const envelope = parseEnvelope(input);
    if (envelope.research === undefined) {
      return {
        ...envelope,
        research: {
          evidence: [
            "The request reached the durable OSVA workflow.",
            "This reference example uses deterministic evidence so no paid model is required.",
          ],
          source: "osva-examples-local-fixture",
        },
      };
    }
    if (envelope.analysis === undefined) {
      return {
        ...envelope,
        analysis: {
          recommendation: "REVIEW",
          rationale: "Human approval and an external delivery event are required before reporting.",
        },
      };
    }

    const markdown = renderMarkdown(envelope);
    const artifact = await context.artifacts.create({
      name: `review-${envelope.request.requestId}.md`,
      mediaType: "text/markdown",
      content: new Blob([markdown], { type: "text/markdown" }),
      metadata: { example: "03-durable-review-workflow" },
      idempotencyKey: `review-${envelope.request.requestId}`,
    });
    return {
      ...envelope,
      report: {
        artifact: artifact.reference,
        name: artifact.name,
        mediaType: artifact.mediaType,
      },
    };
  },
});

export function buildReviewAgentManifest(runtimeUrl: string) {
  return {
    schemaVersion: "1" as const,
    key: "durable-review-agent",
    name: "Durable Review Agent",
    runtime: {
      type: "REMOTE_HTTP" as const,
      protocolVersion: "1" as const,
      endpoint: runtimeUrl,
      timeoutMs: 30_000,
    },
    input: { schema: { type: "object" } },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 30_000, maxAttempts: 1 },
    capabilities: { model: false, tools: [] as string[] },
  };
}

function parseEnvelope(input: JsonValue): ReviewEnvelope {
  if (!isJsonRecord(input)) {
    throw new Error("Workflow input must be an object.");
  }
  const request = input["request"];
  if (request === undefined || !isJsonRecord(request)) {
    throw new Error("Workflow envelope is missing request.");
  }
  if (
    typeof request["requestId"] !== "string" ||
    typeof request["subject"] !== "string" ||
    typeof request["question"] !== "string"
  ) {
    throw new Error("Workflow request must include requestId, subject, and question strings.");
  }
  return input as ReviewEnvelope;
}

function renderMarkdown(envelope: ReviewEnvelope): string {
  const evidence = Array.isArray(envelope.research?.evidence) ? envelope.research.evidence.map(String) : [];
  return [
    `# Review: ${envelope.request.subject}`,
    "",
    `**Question:** ${envelope.request.question}`,
    "",
    "## Evidence",
    ...evidence.map((item) => `- ${item}`),
    "",
    "## Analysis",
    `Recommendation: ${String(envelope.analysis?.recommendation ?? "UNKNOWN")}`,
    "",
    String(envelope.analysis?.rationale ?? "No rationale recorded."),
    "",
  ].join("\n");
}
