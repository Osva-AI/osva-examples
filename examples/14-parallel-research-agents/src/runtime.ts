import type { JsonObject, JsonValue } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";
import { isJsonRecord } from "@osva-examples/utils";

import { collectBranchFindings, type BranchResearchResult, type ResearchBranchId } from "./fixtures.js";
import { buildResearchRequest, type ResearchRequest } from "./input.js";
import { renderParallelResearchMarkdown } from "./report.js";
import type { RuntimeRoute } from "./manifest.js";
import { synthesizeParallelResearch, type ResearchSynthesis } from "./synthesis.js";

interface ResearchEnvelope {
  readonly request: ResearchRequest;
  readonly plan?: { readonly subQuestions: readonly string[] };
  readonly branchResults?: Partial<Record<ResearchBranchId, BranchResearchResult>>;
  readonly synthesis?: ResearchSynthesis;
  readonly report?: JsonObject;
}

const BRANCH_BY_ROUTE: Readonly<Record<Exclude<RuntimeRoute, "plan" | "synthesize" | "report">, ResearchBranchId>> = {
  market: "market",
  competitor: "competitor",
  customer: "customer",
};

export function createRouteRuntime(route: RuntimeRoute) {
  return createRuntime({
    execute: async (input) => executeRoute(route, input),
  });
}

export async function executeRoute(route: RuntimeRoute, input: JsonValue): Promise<JsonObject> {
  const envelope = parseEnvelope(input);

  if (route === "plan") {
    if (envelope.plan !== undefined) {
      return toJson(envelope);
    }
    const plan = {
      subQuestions: [
        "How is buyer demand changing?",
        "How are competitors positioning AI assistants?",
        "What adoption barriers do customers report?",
      ],
    };
    return toJson({ ...envelope, plan });
  }

  if (route === "market" || route === "competitor" || route === "customer") {
    const branch = BRANCH_BY_ROUTE[route];
    const branchResult = collectBranchFindings(envelope.request.question, branch);
    return toJson({
      ...envelope,
      branchResults: {
        ...(envelope.branchResults ?? {}),
        [branch]: branchResult,
      },
    });
  }

  if (route === "synthesize") {
    if (envelope.synthesis !== undefined) {
      return toJson(envelope);
    }
    const branches = requiredBranches(envelope.branchResults);
    const synthesis = synthesizeParallelResearch(envelope.request, branches);
    return toJson({ ...envelope, synthesis });
  }

  throw new Error("Report route must be served by reportRuntime over HTTP.");
}

function requiredBranches(branchResults: ResearchEnvelope["branchResults"]): readonly BranchResearchResult[] {
  const market = branchResults?.market;
  const competitor = branchResults?.competitor;
  const customer = branchResults?.customer;
  if (market === undefined || competitor === undefined || customer === undefined) {
    throw new Error("JOIN output must include market, competitor, and customer branch results before synthesis.");
  }
  return [market, competitor, customer];
}

function parseEnvelope(input: JsonValue): ResearchEnvelope {
  if (!isJsonRecord(input)) {
    throw new Error("Workflow input must be an object.");
  }
  const requestRaw = input["request"];
  if (requestRaw === undefined || !isJsonRecord(requestRaw)) {
    throw new Error("Workflow input must include request.");
  }
  if (typeof requestRaw["researchId"] !== "string" || typeof requestRaw["question"] !== "string") {
    throw new Error("Workflow request must include researchId and question.");
  }
  const request = buildResearchRequest(requestRaw["question"], requestRaw["researchId"]);

  const envelope: ResearchEnvelope = { request };
  const planRaw = input["plan"];
  if (planRaw !== undefined) {
    if (!isJsonRecord(planRaw) || !Array.isArray(planRaw["subQuestions"])) {
      throw new Error("Invalid plan shape.");
    }
    return {
      ...envelope,
      plan: { subQuestions: planRaw["subQuestions"].filter((item): item is string => typeof item === "string") },
      ...(parseBranchResults(input) === undefined ? {} : { branchResults: parseBranchResults(input) }),
      ...(parseSynthesis(input) === undefined ? {} : { synthesis: parseSynthesis(input) }),
    };
  }

  const branchResults = parseBranchResults(input);
  if (branchResults !== undefined) {
    return {
      ...envelope,
      ...(parsePlan(input) === undefined ? {} : { plan: parsePlan(input) }),
      branchResults,
      ...(parseSynthesis(input) === undefined ? {} : { synthesis: parseSynthesis(input) }),
    };
  }

  return envelope;
}

function parsePlan(input: JsonObject): ResearchEnvelope["plan"] | undefined {
  const planRaw = input["plan"];
  if (planRaw === undefined || !isJsonRecord(planRaw) || !Array.isArray(planRaw["subQuestions"])) {
    return undefined;
  }
  return { subQuestions: planRaw["subQuestions"].filter((item): item is string => typeof item === "string") };
}

function parseBranchResults(input: JsonObject): ResearchEnvelope["branchResults"] | undefined {
  const raw = input["branchResults"];
  if (raw === undefined || !isJsonRecord(raw)) return undefined;
  const parseBranch = (key: ResearchBranchId): BranchResearchResult | undefined => {
    const value = raw[key];
    if (value === undefined || !isJsonRecord(value) || value["branch"] !== key || !Array.isArray(value["findings"])) {
      return undefined;
    }
    return value as unknown as BranchResearchResult;
  };
  const market = parseBranch("market");
  const competitor = parseBranch("competitor");
  const customer = parseBranch("customer");
  if (market === undefined && competitor === undefined && customer === undefined) {
    return undefined;
  }
  return {
    ...(market === undefined ? {} : { market }),
    ...(competitor === undefined ? {} : { competitor }),
    ...(customer === undefined ? {} : { customer }),
  };
}

function parseSynthesis(input: JsonObject): ResearchSynthesis | undefined {
  const raw = input["synthesis"];
  if (
    raw === undefined ||
    !isJsonRecord(raw) ||
    typeof raw["question"] !== "string" ||
    !Array.isArray(raw["sections"])
  ) {
    return undefined;
  }
  return raw as unknown as ResearchSynthesis;
}

function toJson(envelope: ResearchEnvelope & { readonly report?: JsonObject }): JsonObject {
  const payload = {
    request: {
      researchId: envelope.request.researchId,
      question: envelope.request.question,
    },
    ...(envelope.plan === undefined ? {} : { plan: envelope.plan }),
    ...(envelope.branchResults === undefined ? {} : { branchResults: envelope.branchResults }),
    ...(envelope.synthesis === undefined ? {} : { synthesis: envelope.synthesis }),
    ...(envelope.report === undefined ? {} : { report: envelope.report }),
  };
  return JSON.parse(JSON.stringify(payload)) as JsonObject;
}

/** Live report route runtime with artifact creation. */
export const reportRuntime = createRuntime({
  execute: async (input, context) => {
    const envelope = parseEnvelope(input);
    const branches = requiredBranches(envelope.branchResults);
    const synthesis = envelope.synthesis ?? synthesizeParallelResearch(envelope.request, branches);
    const markdown = renderParallelResearchMarkdown(envelope.request, synthesis);
    const artifact = await context.artifacts.create({
      name: `parallel-research-${envelope.request.researchId}.md`,
      mediaType: "text/markdown",
      content: new Blob([markdown], { type: "text/markdown" }),
      metadata: { example: "14-parallel-research-agents" },
      idempotencyKey: `parallel-report-${envelope.request.researchId}`,
    });
    return toJson({
      ...envelope,
      synthesis,
      report: {
        artifact: artifact.reference,
        name: artifact.name,
        mediaType: artifact.mediaType,
        branchCount: branches.length,
      },
    });
  },
});
