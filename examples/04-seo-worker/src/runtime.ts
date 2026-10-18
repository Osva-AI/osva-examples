import type { JsonObject, JsonValue, ToolVersionId } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";
import { isJsonRecord } from "@osva-examples/utils";

import { normalizePageSnapshot } from "./fixtures.js";
import { buildSeoWorkerRequest, validateSeoWorkerInput } from "./input.js";
import { analyzePageSeo, renderMarkdownAudit } from "./seo.js";
import type { PageSnapshot, SeoAuditResult, SeoWorkerRequest } from "./types.js";

export const PAGE_TOOL_BINDING = "page_tool";

interface ParsedSeoEnvelope {
  readonly request: SeoWorkerRequest;
  readonly page?: PageSnapshot;
  readonly audit?: SeoAuditResult;
}

export const seoWorkerRuntime = createRuntime({
  execute: async (input, context) => {
    const envelope = parseEnvelope(input);

    if (envelope.page === undefined) {
      const toolResult = await context.tools.invoke({
        binding: PAGE_TOOL_BINDING,
        input: { url: envelope.request.url },
        idempotencyKey: `fetch-${envelope.request.auditId}`,
      });
      const page = extractPageFromToolResult(toolResult);
      return toWorkflowJson({ ...envelope, page });
    }

    if (envelope.audit === undefined) {
      const audit = analyzePageSeo(envelope.page, envelope.request);
      return toWorkflowJson({ ...envelope, audit });
    }

    const markdown = renderMarkdownAudit(envelope.request, envelope.page, envelope.audit);
    const artifact = await context.artifacts.create({
      name: `seo-audit-${envelope.request.auditId}.md`,
      mediaType: "text/markdown",
      content: new Blob([markdown], { type: "text/markdown" }),
      metadata: { example: "04-seo-worker", url: envelope.request.url },
      idempotencyKey: `seo-audit-${envelope.request.auditId}`,
    });
    return toWorkflowJson({
      ...envelope,
      report: {
        artifact: artifact.reference,
        name: artifact.name,
        mediaType: artifact.mediaType,
        recommendationCount: envelope.audit.recommendations.length,
      },
    });
  },
});

export function buildSeoWorkerAgentManifest(runtimeUrl: string, toolVersionId: ToolVersionId) {
  return {
    schemaVersion: "1" as const,
    key: "seo-worker-agent",
    name: "SEO Worker Agent",
    runtime: {
      type: "REMOTE_HTTP" as const,
      protocolVersion: "1" as const,
      endpoint: runtimeUrl,
      timeoutMs: 30_000,
    },
    input: {
      schema: {
        type: "object",
        properties: {
          request: {
            type: "object",
            properties: {
              auditId: { type: "string" },
              url: { type: "string" },
              targetKeyword: { type: "string" },
              businessContext: { type: "string" },
            },
            required: ["auditId", "url", "targetKeyword"],
          },
        },
        required: ["request"],
      },
    },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 30_000, maxAttempts: 1 },
    capabilities: { model: false, tools: [PAGE_TOOL_BINDING] },
    tools: { [PAGE_TOOL_BINDING]: { toolVersionId } },
  };
}

export function parseEnvelope(input: JsonValue): ParsedSeoEnvelope {
  if (!isJsonRecord(input)) {
    throw new Error("Workflow input must be an object.");
  }
  const requestRaw = input["request"];
  if (requestRaw === undefined || !isJsonRecord(requestRaw)) {
    throw new Error("Workflow envelope is missing request.");
  }
  if (typeof requestRaw["auditId"] !== "string") {
    throw new Error("Workflow request must include auditId.");
  }
  const validated = validateSeoWorkerInput({
    url: requestRaw["url"],
    targetKeyword: requestRaw["targetKeyword"],
    businessContext: requestRaw["businessContext"],
  });
  const request = buildSeoWorkerRequest(validated, requestRaw["auditId"]);

  const envelope: ParsedSeoEnvelope = { request };

  const pageRaw = input["page"];
  if (pageRaw !== undefined) {
    return { ...envelope, page: normalizePageSnapshot(pageRaw), ...parseAuditOptional(input) };
  }

  return envelope;
}

function toWorkflowJson(
  envelope: ParsedSeoEnvelope & {
    readonly report?: JsonObject;
  },
): JsonObject {
  const request: JsonObject = {
    auditId: envelope.request.auditId,
    url: envelope.request.url,
    targetKeyword: envelope.request.targetKeyword,
    ...(envelope.request.businessContext === undefined ? {} : { businessContext: envelope.request.businessContext }),
  };

  return {
    request,
    ...(envelope.page === undefined ? {} : { page: pageToJson(envelope.page) }),
    ...(envelope.audit === undefined ? {} : { audit: auditToJson(envelope.audit) }),
    ...(envelope.report === undefined ? {} : { report: envelope.report }),
  };
}

function pageToJson(page: PageSnapshot): JsonObject {
  return {
    url: page.url,
    title: page.title,
    metaDescription: page.metaDescription,
    canonical: page.canonical,
    headings: page.headings.map((heading) => ({ level: heading.level, text: heading.text })),
    bodyText: page.bodyText,
    links: page.links.map((link) => ({ href: link.href, text: link.text, internal: link.internal })),
    images: page.images.map((image) => ({ src: image.src, alt: image.alt })),
    robotsMeta: page.robotsMeta,
    structuredDataTypes: [...page.structuredDataTypes],
    stats: {
      wordCount: page.stats.wordCount,
      internalLinkCount: page.stats.internalLinkCount,
      externalLinkCount: page.stats.externalLinkCount,
    },
  };
}

function auditToJson(audit: SeoAuditResult): JsonObject {
  return {
    summary: audit.summary,
    recommendations: audit.recommendations.map((item) => ({
      id: item.id,
      category: item.category,
      severity: item.severity,
      impact: item.impact,
      effort: item.effort,
      finding: item.finding,
      recommendation: item.recommendation,
      ...(item.evidence === undefined ? {} : { evidence: item.evidence }),
    })),
  };
}

function parseAuditOptional(input: JsonObject): { audit?: SeoAuditResult } {
  const auditRaw = input["audit"];
  if (auditRaw === undefined || !isJsonRecord(auditRaw)) {
    return {};
  }
  const recommendationsRaw = auditRaw["recommendations"];
  const summary = auditRaw["summary"];
  if (!Array.isArray(recommendationsRaw) || typeof summary !== "string") {
    throw new Error("Audit object is malformed.");
  }
  return {
    audit: {
      summary,
      recommendations: recommendationsRaw.map(parseRecommendation),
    },
  };
}

function parseRecommendation(raw: JsonValue): SeoAuditResult["recommendations"][number] {
  if (!isJsonRecord(raw)) {
    throw new Error("Recommendation must be an object.");
  }
  const id = raw["id"];
  const category = raw["category"];
  const severity = raw["severity"];
  const impact = raw["impact"];
  const effort = raw["effort"];
  const finding = raw["finding"];
  const recommendation = raw["recommendation"];
  if (
    typeof id !== "string" ||
    typeof category !== "string" ||
    typeof severity !== "string" ||
    typeof impact !== "string" ||
    typeof effort !== "string" ||
    typeof finding !== "string" ||
    typeof recommendation !== "string"
  ) {
    throw new Error("Recommendation fields are incomplete.");
  }
  const evidence = raw["evidence"];
  return {
    id,
    category: category as SeoAuditResult["recommendations"][number]["category"],
    severity: severity as SeoAuditResult["recommendations"][number]["severity"],
    impact: impact as SeoAuditResult["recommendations"][number]["impact"],
    effort: effort as SeoAuditResult["recommendations"][number]["effort"],
    finding,
    recommendation,
    ...(typeof evidence === "string" ? { evidence } : {}),
  };
}

function extractPageFromToolResult(toolResult: JsonValue): PageSnapshot {
  if (!isJsonRecord(toolResult)) {
    throw new Error("fetch_page tool returned a non-object result.");
  }
  const page = toolResult["page"];
  if (page === undefined) {
    throw new Error("fetch_page tool result is missing page.");
  }
  return normalizePageSnapshot(page);
}
