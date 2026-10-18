import type { JsonObject, JsonValue, ToolVersionId } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";
import { isJsonRecord } from "@osva-examples/utils";

import { applyReviewAdjustments, synthesizeThemes } from "./analysis.js";
import { extractSourcesFromToolResult } from "./connector.js";
import { normalizeResearchSources } from "./fixtures.js";
import { buildResearchWorkerRequest, validateResearchWorkerInput } from "./input.js";
import { createResearchPlan } from "./planner.js";
import { renderResearchReportMarkdown } from "./report.js";
import { collectThemesWithReviewIssues, reviewEvidence } from "./review.js";
import { extractEvidence } from "./research.js";
import type {
  EvidenceRecord,
  EvidenceReview,
  ResearchAnalysis,
  ResearchPlan,
  ResearchSource,
  ResearchWorkerRequest,
} from "./types.js";

export const SOURCE_TOOL_BINDING = "research_source_tool";

interface ParsedResearchEnvelope {
  readonly request: ResearchWorkerRequest;
  readonly plan?: ResearchPlan;
  readonly sources?: readonly ResearchSource[];
  readonly evidence?: readonly EvidenceRecord[];
  readonly analysis?: ResearchAnalysis;
  readonly review?: EvidenceReview;
}

export const researchAnalystRuntime = createRuntime({
  execute: async (input, context) => {
    const envelope = parseEnvelope(input);

    if (envelope.plan === undefined) {
      const plan = createResearchPlan(envelope.request);
      return toWorkflowJson({ ...envelope, plan });
    }

    if (envelope.sources === undefined) {
      const query = [envelope.plan.researchQuestion, ...envelope.plan.subQuestions].join(" ");
      const toolResult = await context.tools.invoke({
        binding: SOURCE_TOOL_BINDING,
        input: { query },
        idempotencyKey: `sources-${envelope.request.researchId}`,
      });
      const sources = extractSourcesFromToolResult(toolResult);
      return toWorkflowJson({ ...envelope, sources });
    }

    if (envelope.evidence === undefined) {
      const evidence = extractEvidence(envelope.sources, envelope.plan);
      return toWorkflowJson({ ...envelope, evidence });
    }

    if (envelope.analysis === undefined) {
      const analysis = synthesizeThemes(envelope.evidence, envelope.plan);
      return toWorkflowJson({ ...envelope, analysis });
    }

    if (envelope.review === undefined) {
      const review = reviewEvidence(envelope.plan, envelope.evidence, envelope.analysis);
      const analysis = applyReviewAdjustments(envelope.analysis, collectThemesWithReviewIssues(review));
      return toWorkflowJson({ ...envelope, review, analysis });
    }

    const markdown = renderResearchReportMarkdown({
      request: envelope.request,
      plan: envelope.plan,
      sources: envelope.sources,
      evidence: envelope.evidence,
      analysis: envelope.analysis,
      review: envelope.review,
    });
    const artifact = await context.artifacts.create({
      name: `research-report-${envelope.request.researchId}.md`,
      mediaType: "text/markdown",
      content: new Blob([markdown], { type: "text/markdown" }),
      metadata: { example: "05-research-analyst-worker", researchId: envelope.request.researchId },
      idempotencyKey: `research-report-${envelope.request.researchId}`,
    });
    return toWorkflowJson({
      ...envelope,
      report: {
        artifact: artifact.reference,
        name: artifact.name,
        mediaType: artifact.mediaType,
        themeCount: envelope.analysis.themes.length,
        issueCount: envelope.review.issues.length,
      },
    });
  },
});

export function buildResearchAnalystAgentManifest(runtimeUrl: string, toolVersionId: ToolVersionId) {
  return {
    schemaVersion: "1" as const,
    key: "research-analyst-agent",
    name: "Research Analyst Agent",
    runtime: {
      type: "REMOTE_HTTP" as const,
      protocolVersion: "1" as const,
      endpoint: runtimeUrl,
      timeoutMs: 45_000,
    },
    input: {
      schema: {
        type: "object",
        properties: {
          request: {
            type: "object",
            properties: {
              researchId: { type: "string" },
              question: { type: "string" },
              objective: { type: "string" },
              audience: { type: "string" },
            },
            required: ["researchId", "question"],
          },
        },
        required: ["request"],
      },
    },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 45_000, maxAttempts: 1 },
    capabilities: { model: false, tools: [SOURCE_TOOL_BINDING] },
    tools: { [SOURCE_TOOL_BINDING]: { toolVersionId } },
  };
}

export function parseEnvelope(input: JsonValue): ParsedResearchEnvelope {
  if (!isJsonRecord(input)) {
    throw new Error("Workflow input must be an object.");
  }
  const requestRaw = input["request"];
  if (requestRaw === undefined || !isJsonRecord(requestRaw)) {
    throw new Error("Workflow envelope is missing request.");
  }
  if (typeof requestRaw["researchId"] !== "string") {
    throw new Error("Workflow request must include researchId.");
  }
  const validated = validateResearchWorkerInput({
    question: requestRaw["question"],
    objective: requestRaw["objective"],
    audience: requestRaw["audience"],
  });
  const request = buildResearchWorkerRequest(validated, requestRaw["researchId"]);

  const envelope: ParsedResearchEnvelope = { request };
  const planRaw = input["plan"];
  if (planRaw === undefined) {
    return envelope;
  }
  const plan = parsePlan(planRaw);

  const sourcesRaw = input["sources"];
  if (sourcesRaw === undefined) {
    return { ...envelope, plan };
  }
  const sources = normalizeResearchSources(sourcesRaw);

  const evidenceRaw = input["evidence"];
  if (evidenceRaw === undefined) {
    return { ...envelope, plan, sources };
  }
  const evidence = parseEvidenceList(evidenceRaw);

  const analysisRaw = input["analysis"];
  if (analysisRaw === undefined) {
    return { ...envelope, plan, sources, evidence };
  }
  const analysis = parseAnalysis(analysisRaw);

  const reviewRaw = input["review"];
  if (reviewRaw === undefined) {
    return { ...envelope, plan, sources, evidence, analysis };
  }
  const review = parseReview(reviewRaw);
  return { ...envelope, plan, sources, evidence, analysis, review };
}

function toWorkflowJson(
  envelope: ParsedResearchEnvelope & {
    readonly report?: JsonObject;
  },
): JsonObject {
  const request: JsonObject = {
    researchId: envelope.request.researchId,
    question: envelope.request.question,
    ...(envelope.request.objective === undefined ? {} : { objective: envelope.request.objective }),
    ...(envelope.request.audience === undefined ? {} : { audience: envelope.request.audience }),
  };

  return {
    request,
    ...(envelope.plan === undefined ? {} : { plan: planToJson(envelope.plan) }),
    ...(envelope.sources === undefined ? {} : { sources: envelope.sources.map(sourceToJson) }),
    ...(envelope.evidence === undefined ? {} : { evidence: envelope.evidence.map(evidenceToJson) }),
    ...(envelope.analysis === undefined ? {} : { analysis: analysisToJson(envelope.analysis) }),
    ...(envelope.review === undefined ? {} : { review: reviewToJson(envelope.review) }),
    ...(envelope.report === undefined ? {} : { report: envelope.report }),
  };
}

function planToJson(plan: ResearchPlan): JsonObject {
  return {
    researchQuestion: plan.researchQuestion,
    subQuestions: [...plan.subQuestions],
    evidenceNeeded: [...plan.evidenceNeeded],
  };
}

function sourceToJson(source: ResearchSource): JsonObject {
  return {
    id: source.id,
    title: source.title,
    publisher: source.publisher,
    content: source.content,
    snippets: source.snippets.map((snippet) => ({
      claim: snippet.claim,
      theme: snippet.theme,
      strength: snippet.strength,
      stance: snippet.stance,
    })),
    ...(source.publishedAt === undefined ? {} : { publishedAt: source.publishedAt }),
    ...(source.url === undefined ? {} : { url: source.url }),
  };
}

function evidenceToJson(record: EvidenceRecord): JsonObject {
  return {
    id: record.id,
    sourceId: record.sourceId,
    claim: record.claim,
    theme: record.theme,
    strength: record.strength,
    ...(record.supports === undefined ? {} : { supports: record.supports }),
    ...(record.contradicts === undefined ? {} : { contradicts: record.contradicts }),
  };
}

function analysisToJson(analysis: ResearchAnalysis): JsonObject {
  return {
    themes: analysis.themes.map((theme) => ({
      name: theme.name,
      finding: theme.finding,
      supportingEvidenceIds: [...theme.supportingEvidenceIds],
      confidence: theme.confidence,
      caveats: [...theme.caveats],
    })),
  };
}

function reviewToJson(review: EvidenceReview): JsonObject {
  return {
    summary: review.summary,
    issues: review.issues.map((issue) => ({
      type: issue.type,
      description: issue.description,
      ...(issue.relatedEvidenceIds === undefined ? {} : { relatedEvidenceIds: [...issue.relatedEvidenceIds] }),
      ...(issue.relatedTheme === undefined ? {} : { relatedTheme: issue.relatedTheme }),
    })),
  };
}

function parsePlan(raw: JsonValue): ResearchPlan {
  if (!isJsonRecord(raw)) {
    throw new Error("Plan must be an object.");
  }
  const researchQuestion = raw["researchQuestion"];
  const subQuestions = raw["subQuestions"];
  const evidenceNeeded = raw["evidenceNeeded"];
  if (typeof researchQuestion !== "string" || !Array.isArray(subQuestions) || !Array.isArray(evidenceNeeded)) {
    throw new Error("Plan object is malformed.");
  }
  return {
    researchQuestion,
    subQuestions: subQuestions.map(String),
    evidenceNeeded: evidenceNeeded.map(String),
  };
}

function parseEvidenceList(raw: JsonValue): EvidenceRecord[] {
  if (!Array.isArray(raw)) {
    throw new Error("Evidence must be an array.");
  }
  return raw.map((item) => {
    if (!isJsonRecord(item)) {
      throw new Error("Evidence record must be an object.");
    }
    const id = item["id"];
    const sourceId = item["sourceId"];
    const claim = item["claim"];
    const theme = item["theme"];
    const strength = item["strength"];
    if (
      typeof id !== "string" ||
      typeof sourceId !== "string" ||
      typeof claim !== "string" ||
      typeof theme !== "string" ||
      (strength !== "strong" && strength !== "moderate" && strength !== "weak")
    ) {
      throw new Error("Evidence record is malformed.");
    }
    const supports = item["supports"];
    const contradicts = item["contradicts"];
    return {
      id,
      sourceId,
      claim,
      theme,
      strength,
      ...(typeof supports === "string" ? { supports } : {}),
      ...(typeof contradicts === "string" ? { contradicts } : {}),
    };
  });
}

function parseAnalysis(raw: JsonValue): ResearchAnalysis {
  if (!isJsonRecord(raw)) {
    throw new Error("Analysis must be an object.");
  }
  const themesRaw = raw["themes"];
  if (!Array.isArray(themesRaw)) {
    throw new Error("Analysis themes must be an array.");
  }
  return {
    themes: themesRaw.map((item) => {
      if (!isJsonRecord(item)) {
        throw new Error("Theme finding must be an object.");
      }
      const name = item["name"];
      const finding = item["finding"];
      const supportingEvidenceIds = item["supportingEvidenceIds"];
      const confidence = item["confidence"];
      const caveats = item["caveats"];
      if (
        typeof name !== "string" ||
        typeof finding !== "string" ||
        !Array.isArray(supportingEvidenceIds) ||
        (confidence !== "high" && confidence !== "medium" && confidence !== "low") ||
        !Array.isArray(caveats)
      ) {
        throw new Error("Theme finding is malformed.");
      }
      return {
        name,
        finding,
        supportingEvidenceIds: supportingEvidenceIds.map(String),
        confidence,
        caveats: caveats.map(String),
      };
    }),
  };
}

function parseReview(raw: JsonValue): EvidenceReview {
  if (!isJsonRecord(raw)) {
    throw new Error("Review must be an object.");
  }
  const summary = raw["summary"];
  const issuesRaw = raw["issues"];
  if (typeof summary !== "string" || !Array.isArray(issuesRaw)) {
    throw new Error("Review object is malformed.");
  }
  return {
    summary,
    issues: issuesRaw.map((item) => {
      if (!isJsonRecord(item)) {
        throw new Error("Review issue must be an object.");
      }
      const type = item["type"];
      const description = item["description"];
      if (
        typeof description !== "string" ||
        (type !== "unsupported" && type !== "conflict" && type !== "weak-evidence" && type !== "coverage-gap")
      ) {
        throw new Error("Review issue is malformed.");
      }
      const relatedEvidenceIds = item["relatedEvidenceIds"];
      const relatedTheme = item["relatedTheme"];
      return {
        type,
        description,
        ...(Array.isArray(relatedEvidenceIds) ? { relatedEvidenceIds: relatedEvidenceIds.map(String) } : {}),
        ...(typeof relatedTheme === "string" ? { relatedTheme } : {}),
      };
    }),
  };
}
