import type { JsonObject, JsonValue, ToolVersionId } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";
import { isJsonRecord } from "@osva-examples/utils";

import { buildEvidenceBundle } from "./fixtures.js";
import { analyzeOpportunities, clusterProblems, draftProductBrief, prioritizeOpportunities } from "./product.js";
import { buildProductWorkerRequest, validateProductWorkerInput } from "./input.js";
import { buildApprovalSummary, renderProductBriefMarkdown } from "./report.js";
import { reviewProductBrief } from "./review.js";
import type {
  ApprovalSummary,
  BriefReview,
  OpportunityPrioritization,
  ProblemCluster,
  ProductBrief,
  ProductEvidenceBundle,
  ProductOpportunity,
  ProductWorkerRequest,
} from "./types.js";

export const PRODUCT_FEEDBACK_TOOL_BINDING = "product_feedback_tool";
export const PRODUCT_TICKETS_TOOL_BINDING = "product_tickets_tool";
export const PRODUCT_METRICS_TOOL_BINDING = "product_metrics_tool";
export const PRODUCT_CONTEXT_TOOL_BINDING = "product_context_tool";

interface ParsedProductEnvelope {
  readonly request: ProductWorkerRequest;
  readonly evidence?: ProductEvidenceBundle;
  readonly clusters?: readonly ProblemCluster[];
  readonly opportunities?: readonly ProductOpportunity[];
  readonly prioritization?: OpportunityPrioritization;
  readonly brief?: ProductBrief;
  readonly review?: BriefReview;
  readonly approvalSummary?: ApprovalSummary;
}

interface RuntimeToolContext {
  readonly tools: {
    invoke(input: { binding: string; input: JsonObject; idempotencyKey: string }): Promise<JsonValue>;
  };
}

export const productManagerRuntime = createRuntime({
  execute: async (input, context) => {
    const envelope = parseEnvelope(input);

    if (envelope.evidence === undefined) {
      const evidence = await collectEvidenceViaTools(envelope.request.productId, context);
      return toWorkflowJson({ ...envelope, evidence });
    }

    if (envelope.clusters === undefined) {
      const clusters = clusterProblems(envelope.evidence);
      return toWorkflowJson({ ...envelope, clusters });
    }

    if (envelope.opportunities === undefined) {
      const opportunities = analyzeOpportunities(envelope.evidence, envelope.clusters);
      return toWorkflowJson({ ...envelope, opportunities });
    }

    if (envelope.prioritization === undefined) {
      const prioritization = prioritizeOpportunities(envelope.opportunities, envelope.clusters);
      return toWorkflowJson({ ...envelope, prioritization });
    }

    if (envelope.brief === undefined) {
      const brief = draftProductBrief({
        request: envelope.request,
        evidence: envelope.evidence,
        prioritization: envelope.prioritization,
        clusters: envelope.clusters,
      });
      return toWorkflowJson({ ...envelope, brief });
    }

    if (envelope.review === undefined) {
      const topOpportunity = envelope.prioritization.opportunities[0];
      const review = reviewProductBrief({
        brief: envelope.brief,
        evidence: envelope.evidence,
        opportunity: topOpportunity,
      });
      const approvalSummary = buildApprovalSummary({
        brief: envelope.brief,
        prioritization: envelope.prioritization,
        review,
      });
      return toWorkflowJson({ ...envelope, review, approvalSummary });
    }

    const approvalSummary =
      envelope.approvalSummary ??
      buildApprovalSummary({
        brief: envelope.brief,
        prioritization: envelope.prioritization,
        review: envelope.review,
      });

    const markdown = renderProductBriefMarkdown({
      request: envelope.request,
      evidence: envelope.evidence,
      clusters: envelope.clusters,
      prioritization: envelope.prioritization,
      brief: envelope.brief,
      review: envelope.review,
      approvalSummary,
    });
    const artifact = await context.artifacts.create({
      name: `product-brief-${envelope.request.briefId}.md`,
      mediaType: "text/markdown",
      content: new Blob([markdown], { type: "text/markdown" }),
      metadata: { example: "08-product-manager-worker", productId: envelope.request.productId },
      idempotencyKey: `product-brief-${envelope.request.briefId}`,
    });
    return toWorkflowJson({
      ...envelope,
      approvalSummary,
      report: {
        artifact: artifact.reference,
        name: artifact.name,
        mediaType: artifact.mediaType,
        opportunityCount: envelope.prioritization.opportunities.length,
        reviewIssueCount: envelope.review.issues.length,
      },
    });
  },
});

async function collectEvidenceViaTools(productId: string, context: RuntimeToolContext): Promise<ProductEvidenceBundle> {
  const toolInput = { productId };
  const prefix = `evidence-${productId}`;

  const [feedbackResult, ticketsResult, metricsResult, contextResult] = await Promise.all([
    context.tools.invoke({
      binding: PRODUCT_FEEDBACK_TOOL_BINDING,
      input: toolInput,
      idempotencyKey: `${prefix}-feedback`,
    }),
    context.tools.invoke({
      binding: PRODUCT_TICKETS_TOOL_BINDING,
      input: toolInput,
      idempotencyKey: `${prefix}-tickets`,
    }),
    context.tools.invoke({
      binding: PRODUCT_METRICS_TOOL_BINDING,
      input: toolInput,
      idempotencyKey: `${prefix}-metrics`,
    }),
    context.tools.invoke({
      binding: PRODUCT_CONTEXT_TOOL_BINDING,
      input: toolInput,
      idempotencyKey: `${prefix}-context`,
    }),
  ]);

  const expected = buildEvidenceBundle(productId);
  const feedbackRaw = extractArray(feedbackResult, "feedback");
  const ticketsRaw = extractArray(ticketsResult, "tickets");
  const metricsRaw = readRequiredRecord(extractNestedRecord(metricsResult, "metrics"), "metrics");
  const contextRaw = readRequiredRecord(extractNestedRecord(contextResult, "context"), "context");

  return {
    productId,
    feedback: normalizeFeedback(feedbackRaw, expected.feedback.length),
    tickets: normalizeTickets(ticketsRaw, expected.tickets.length),
    metrics: normalizeMetrics(metricsRaw),
    context: normalizeContext(contextRaw),
  };
}

function extractNestedRecord(raw: JsonValue, field: string): JsonObject {
  if (!isJsonRecord(raw)) {
    throw new Error(`Tool result must be an object for ${field}.`);
  }
  const nested = raw[field];
  if (nested === undefined || !isJsonRecord(nested)) {
    throw new Error(`Tool result is missing ${field}.`);
  }
  return nested;
}

function extractArray(raw: JsonValue, field: string): JsonValue[] {
  if (!isJsonRecord(raw)) {
    throw new Error(`Tool result must be an object for ${field}.`);
  }
  const nested = raw[field];
  if (!Array.isArray(nested)) {
    throw new Error(`Tool result is missing ${field} array.`);
  }
  return nested;
}

function normalizeFeedback(raw: JsonValue[], expectedLength: number): ProductEvidenceBundle["feedback"] {
  void expectedLength;
  return raw.map((item, index) => {
    if (!isJsonRecord(item)) {
      throw new Error(`feedback[${index}] must be an object.`);
    }
    const id = item["id"];
    const customerSegment = item["customerSegment"];
    const text = item["text"];
    if (typeof id !== "string" || typeof customerSegment !== "string" || typeof text !== "string") {
      throw new Error(`feedback[${index}] is malformed.`);
    }
    return { id, customerSegment, text };
  });
}

function normalizeTickets(raw: JsonValue[], expectedLength: number): ProductEvidenceBundle["tickets"] {
  void expectedLength;
  return raw.map((item, index) => {
    if (!isJsonRecord(item)) {
      throw new Error(`tickets[${index}] must be an object.`);
    }
    const id = item["id"];
    const category = item["category"];
    const text = item["text"];
    if (typeof id !== "string" || typeof category !== "string" || typeof text !== "string") {
      throw new Error(`tickets[${index}] is malformed.`);
    }
    return { id, category, text };
  });
}

function normalizeMetrics(raw: JsonObject): ProductEvidenceBundle["metrics"] {
  const signups = readNumber(raw["signups"], "metrics.signups");
  const onboardingCompleted = readNumber(raw["onboardingCompleted"], "metrics.onboardingCompleted");
  const activationRate = readNumber(raw["activationRate"], "metrics.activationRate");
  const weekOneRetention = readNumber(raw["weekOneRetention"], "metrics.weekOneRetention");
  const onboardingStepsRaw = raw["onboardingSteps"];
  const featureAdoptionRaw = raw["featureAdoption"];
  if (!Array.isArray(onboardingStepsRaw) || !Array.isArray(featureAdoptionRaw)) {
    throw new Error("metrics onboardingSteps/featureAdoption must be arrays.");
  }
  return {
    signups,
    onboardingCompleted,
    activationRate,
    weekOneRetention,
    onboardingSteps: onboardingStepsRaw.map((item, index) => {
      if (!isJsonRecord(item)) throw new Error(`onboardingSteps[${index}] malformed.`);
      return {
        step: readString(item["step"], `onboardingSteps[${index}].step`),
        started: readNumber(item["started"], `onboardingSteps[${index}].started`),
        completed: readNumber(item["completed"], `onboardingSteps[${index}].completed`),
      };
    }),
    featureAdoption: featureAdoptionRaw.map((item, index) => {
      if (!isJsonRecord(item)) throw new Error(`featureAdoption[${index}] malformed.`);
      return {
        feature: readString(item["feature"], `featureAdoption[${index}].feature`),
        adopters: readNumber(item["adopters"], `featureAdoption[${index}].adopters`),
      };
    }),
  };
}

function normalizeContext(raw: JsonObject): ProductEvidenceBundle["context"] {
  const targetSegment = readString(raw["targetSegment"], "context.targetSegment");
  const strategicObjective = readString(raw["strategicObjective"], "context.strategicObjective");
  const constraintsRaw = raw["constraints"];
  const outOfScopeRaw = raw["outOfScope"];
  if (!Array.isArray(constraintsRaw) || !Array.isArray(outOfScopeRaw)) {
    throw new Error("context constraints/outOfScope must be arrays.");
  }
  return {
    targetSegment,
    strategicObjective,
    constraints: constraintsRaw.map(String),
    outOfScope: outOfScopeRaw.map(String),
  };
}

function readRequiredRecord(value: JsonValue | undefined, field: string): JsonObject {
  if (value === undefined || !isJsonRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value;
}

function readNumber(value: JsonValue | undefined, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return value;
}

function readString(value: JsonValue | undefined, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

export function buildProductManagerAgentManifest(
  runtimeUrl: string,
  toolVersionIds: {
    readonly feedback: ToolVersionId;
    readonly tickets: ToolVersionId;
    readonly metrics: ToolVersionId;
    readonly context: ToolVersionId;
  },
) {
  return {
    schemaVersion: "1" as const,
    key: "product-manager-agent",
    name: "Product Manager Agent",
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
              briefId: { type: "string" },
              productId: { type: "string" },
              objective: { type: "string" },
              context: { type: "string" },
            },
            required: ["briefId", "productId"],
          },
        },
        required: ["request"],
      },
    },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 45_000, maxAttempts: 1 },
    capabilities: {
      model: false,
      tools: [
        PRODUCT_FEEDBACK_TOOL_BINDING,
        PRODUCT_TICKETS_TOOL_BINDING,
        PRODUCT_METRICS_TOOL_BINDING,
        PRODUCT_CONTEXT_TOOL_BINDING,
      ],
    },
    tools: {
      [PRODUCT_FEEDBACK_TOOL_BINDING]: { toolVersionId: toolVersionIds.feedback },
      [PRODUCT_TICKETS_TOOL_BINDING]: { toolVersionId: toolVersionIds.tickets },
      [PRODUCT_METRICS_TOOL_BINDING]: { toolVersionId: toolVersionIds.metrics },
      [PRODUCT_CONTEXT_TOOL_BINDING]: { toolVersionId: toolVersionIds.context },
    },
  };
}

export function parseEnvelope(input: JsonValue): ParsedProductEnvelope {
  if (!isJsonRecord(input)) {
    throw new Error("Workflow input must be an object.");
  }
  const requestRaw = input["request"];
  if (requestRaw === undefined || !isJsonRecord(requestRaw)) {
    throw new Error("Workflow envelope is missing request.");
  }
  if (typeof requestRaw["briefId"] !== "string") {
    throw new Error("Workflow request must include briefId.");
  }
  const validated = validateProductWorkerInput({
    productId: requestRaw["productId"],
    objective: requestRaw["objective"],
    context: requestRaw["context"],
  });
  const request = buildProductWorkerRequest(validated, requestRaw["briefId"]);

  const envelope: ParsedProductEnvelope = { request };

  const evidenceRaw = input["evidence"];
  if (evidenceRaw === undefined) {
    return envelope;
  }
  const evidence = parseEvidence(evidenceRaw, request.productId);

  const clustersRaw = input["clusters"];
  if (clustersRaw === undefined) {
    return { ...envelope, evidence };
  }
  const clusters = parseClusters(clustersRaw);

  const opportunitiesRaw = input["opportunities"];
  if (opportunitiesRaw === undefined) {
    return { ...envelope, evidence, clusters };
  }
  const opportunities = parseOpportunities(opportunitiesRaw);

  const prioritizationRaw = input["prioritization"];
  if (prioritizationRaw === undefined) {
    return { ...envelope, evidence, clusters, opportunities };
  }
  const prioritization = parsePrioritization(prioritizationRaw);

  const briefRaw = input["brief"];
  if (briefRaw === undefined) {
    return { ...envelope, evidence, clusters, opportunities, prioritization };
  }
  const brief = parseBrief(briefRaw);

  const reviewRaw = input["review"];
  if (reviewRaw === undefined) {
    return { ...envelope, evidence, clusters, opportunities, prioritization, brief };
  }
  const review = parseReview(reviewRaw);

  const approvalSummaryRaw = input["approvalSummary"];
  const approvalSummary = approvalSummaryRaw === undefined ? undefined : parseApprovalSummary(approvalSummaryRaw);

  return { ...envelope, evidence, clusters, opportunities, prioritization, brief, review, approvalSummary };
}

function toWorkflowJson(
  envelope: ParsedProductEnvelope & {
    readonly report?: JsonObject;
  },
): JsonObject {
  const request: JsonObject = {
    briefId: envelope.request.briefId,
    productId: envelope.request.productId,
    ...(envelope.request.objective === undefined ? {} : { objective: envelope.request.objective }),
    ...(envelope.request.context === undefined ? {} : { context: envelope.request.context }),
  };

  return {
    request,
    ...(envelope.evidence === undefined ? {} : { evidence: evidenceToJson(envelope.evidence) }),
    ...(envelope.clusters === undefined ? {} : { clusters: envelope.clusters.map(clusterToJson) }),
    ...(envelope.opportunities === undefined ? {} : { opportunities: envelope.opportunities.map(opportunityToJson) }),
    ...(envelope.prioritization === undefined ? {} : { prioritization: prioritizationToJson(envelope.prioritization) }),
    ...(envelope.brief === undefined ? {} : { brief: briefToJson(envelope.brief) }),
    ...(envelope.review === undefined ? {} : { review: reviewToJson(envelope.review) }),
    ...(envelope.approvalSummary === undefined
      ? {}
      : { approvalSummary: approvalSummaryToJson(envelope.approvalSummary) }),
    ...(envelope.report === undefined ? {} : { report: envelope.report }),
  };
}

function evidenceToJson(evidence: ProductEvidenceBundle): JsonObject {
  return {
    productId: evidence.productId,
    feedback: evidence.feedback.map((item) => ({ ...item })),
    tickets: evidence.tickets.map((item) => ({ ...item })),
    metrics: {
      ...evidence.metrics,
      onboardingSteps: evidence.metrics.onboardingSteps.map((step) => ({ ...step })),
      featureAdoption: evidence.metrics.featureAdoption.map((item) => ({ ...item })),
    },
    context: {
      ...evidence.context,
      constraints: [...evidence.context.constraints],
      outOfScope: [...evidence.context.outOfScope],
    },
  };
}

function clusterToJson(cluster: ProblemCluster): JsonObject {
  return {
    id: cluster.id,
    theme: cluster.theme,
    problemStatement: cluster.problemStatement,
    feedbackIds: [...cluster.feedbackIds],
    ticketIds: [...cluster.ticketIds],
    ...(cluster.supportingMetrics === undefined ? {} : { supportingMetrics: [...cluster.supportingMetrics] }),
  };
}

function opportunityToJson(opportunity: ProductOpportunity): JsonObject {
  return { ...opportunity };
}

function prioritizationToJson(prioritization: OpportunityPrioritization): JsonObject {
  return {
    method: prioritization.method,
    opportunities: prioritization.opportunities.map((item) => ({ ...item })),
  };
}

function briefToJson(brief: ProductBrief): JsonObject {
  return {
    title: brief.title,
    problem: brief.problem,
    targetUser: brief.targetUser,
    evidence: [...brief.evidence],
    goal: brief.goal,
    nonGoals: [...brief.nonGoals],
    proposedApproach: [...brief.proposedApproach],
    successMetrics: [...brief.successMetrics],
    risks: [...brief.risks],
    openQuestions: [...brief.openQuestions],
  };
}

function reviewToJson(review: BriefReview): JsonObject {
  return {
    summary: review.summary,
    issues: review.issues.map((issue) => ({ ...issue })),
  };
}

function approvalSummaryToJson(summary: ApprovalSummary): JsonObject {
  return {
    chosenProblem: summary.chosenProblem,
    evidenceHighlights: [...summary.evidenceHighlights],
    prioritizationRationale: summary.prioritizationRationale,
    proposedApproach: [...summary.proposedApproach],
    successMetrics: [...summary.successMetrics],
    reviewerConcerns: [...summary.reviewerConcerns],
  };
}

function parseEvidence(raw: JsonValue, productId: string): ProductEvidenceBundle {
  if (!isJsonRecord(raw)) {
    throw new Error("Evidence must be an object.");
  }
  const expected = buildEvidenceBundle(productId);
  void expected;
  const feedbackRaw = raw["feedback"];
  const ticketsRaw = raw["tickets"];
  const metricsRaw = readRequiredRecord(raw["metrics"], "evidence.metrics");
  const contextRaw = readRequiredRecord(raw["context"], "evidence.context");
  if (!Array.isArray(feedbackRaw) || !Array.isArray(ticketsRaw)) {
    throw new Error("Evidence feedback/tickets must be arrays.");
  }
  return {
    productId,
    feedback: normalizeFeedback(feedbackRaw, 0),
    tickets: normalizeTickets(ticketsRaw, 0),
    metrics: normalizeMetrics(metricsRaw),
    context: normalizeContext(contextRaw),
  };
}

function parseClusters(raw: JsonValue): ProblemCluster[] {
  if (!Array.isArray(raw)) {
    throw new Error("Clusters must be an array.");
  }
  return raw.map(parseCluster);
}

function parseCluster(raw: JsonValue): ProblemCluster {
  if (!isJsonRecord(raw)) {
    throw new Error("Cluster must be an object.");
  }
  const id = raw["id"];
  const theme = raw["theme"];
  const problemStatement = raw["problemStatement"];
  const feedbackIds = raw["feedbackIds"];
  const ticketIds = raw["ticketIds"];
  if (
    typeof id !== "string" ||
    typeof theme !== "string" ||
    typeof problemStatement !== "string" ||
    !Array.isArray(feedbackIds) ||
    !Array.isArray(ticketIds)
  ) {
    throw new Error("Cluster is malformed.");
  }
  const supportingMetrics = raw["supportingMetrics"];
  return {
    id,
    theme,
    problemStatement,
    feedbackIds: feedbackIds.map(String),
    ticketIds: ticketIds.map(String),
    ...(Array.isArray(supportingMetrics) ? { supportingMetrics: supportingMetrics.map(String) } : {}),
  };
}

function parseOpportunities(raw: JsonValue): ProductOpportunity[] {
  if (!Array.isArray(raw)) {
    throw new Error("Opportunities must be an array.");
  }
  return raw.map(parseOpportunity);
}

function parseOpportunity(raw: JsonValue): ProductOpportunity {
  if (!isJsonRecord(raw)) {
    throw new Error("Opportunity must be an object.");
  }
  const id = raw["id"];
  const problemClusterId = raw["problemClusterId"];
  const userProblem = raw["userProblem"];
  const targetUser = raw["targetUser"];
  const desiredOutcome = raw["desiredOutcome"];
  const evidenceStrength = raw["evidenceStrength"];
  const businessAlignment = raw["businessAlignment"];
  if (
    typeof id !== "string" ||
    typeof problemClusterId !== "string" ||
    typeof userProblem !== "string" ||
    typeof targetUser !== "string" ||
    typeof desiredOutcome !== "string" ||
    (evidenceStrength !== "high" && evidenceStrength !== "medium" && evidenceStrength !== "low") ||
    (businessAlignment !== "high" && businessAlignment !== "medium" && businessAlignment !== "low")
  ) {
    throw new Error("Opportunity is malformed.");
  }
  return {
    id,
    problemClusterId,
    userProblem,
    targetUser,
    desiredOutcome,
    evidenceStrength,
    businessAlignment,
  };
}

function parsePrioritization(raw: JsonValue): OpportunityPrioritization {
  if (!isJsonRecord(raw)) {
    throw new Error("Prioritization must be an object.");
  }
  const method = raw["method"];
  const opportunitiesRaw = raw["opportunities"];
  if (typeof method !== "string" || !Array.isArray(opportunitiesRaw)) {
    throw new Error("Prioritization is malformed.");
  }
  return {
    method,
    opportunities: opportunitiesRaw.map((item) => {
      const opportunity = parseOpportunity(item);
      if (!isJsonRecord(item)) {
        throw new Error("Prioritized opportunity must be an object.");
      }
      const priorityScore = item["priorityScore"];
      const priorityRank = item["priorityRank"];
      const rationale = item["rationale"];
      if (typeof priorityScore !== "number" || typeof priorityRank !== "number" || typeof rationale !== "string") {
        throw new Error("Prioritized opportunity is malformed.");
      }
      return { ...opportunity, priorityScore, priorityRank, rationale };
    }),
  };
}

function parseBrief(raw: JsonValue): ProductBrief {
  if (!isJsonRecord(raw)) {
    throw new Error("Brief must be an object.");
  }
  const title = raw["title"];
  const problem = raw["problem"];
  const targetUser = raw["targetUser"];
  const evidence = raw["evidence"];
  const goal = raw["goal"];
  const nonGoals = raw["nonGoals"];
  const proposedApproach = raw["proposedApproach"];
  const successMetrics = raw["successMetrics"];
  const risks = raw["risks"];
  const openQuestions = raw["openQuestions"];
  if (
    typeof title !== "string" ||
    typeof problem !== "string" ||
    typeof targetUser !== "string" ||
    typeof goal !== "string" ||
    !Array.isArray(evidence) ||
    !Array.isArray(nonGoals) ||
    !Array.isArray(proposedApproach) ||
    !Array.isArray(successMetrics) ||
    !Array.isArray(risks) ||
    !Array.isArray(openQuestions)
  ) {
    throw new Error("Brief is malformed.");
  }
  return {
    title,
    problem,
    targetUser,
    evidence: evidence.map(String),
    goal,
    nonGoals: nonGoals.map(String),
    proposedApproach: proposedApproach.map(String),
    successMetrics: successMetrics.map(String),
    risks: risks.map(String),
    openQuestions: openQuestions.map(String),
  };
}

function parseReview(raw: JsonValue): BriefReview {
  if (!isJsonRecord(raw)) {
    throw new Error("Review must be an object.");
  }
  const summary = raw["summary"];
  const issuesRaw = raw["issues"];
  if (typeof summary !== "string" || !Array.isArray(issuesRaw)) {
    throw new Error("Review is malformed.");
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
        (type !== "weak-evidence" &&
          type !== "unsupported-assumption" &&
          type !== "missing-metric" &&
          type !== "scope-risk" &&
          type !== "solution-bias" &&
          type !== "business-conflict")
      ) {
        throw new Error("Review issue is malformed.");
      }
      return { type, description };
    }),
  };
}

function parseApprovalSummary(raw: JsonValue): ApprovalSummary {
  if (!isJsonRecord(raw)) {
    throw new Error("Approval summary must be an object.");
  }
  const chosenProblem = raw["chosenProblem"];
  const evidenceHighlights = raw["evidenceHighlights"];
  const prioritizationRationale = raw["prioritizationRationale"];
  const proposedApproach = raw["proposedApproach"];
  const successMetrics = raw["successMetrics"];
  const reviewerConcerns = raw["reviewerConcerns"];
  if (
    typeof chosenProblem !== "string" ||
    typeof prioritizationRationale !== "string" ||
    !Array.isArray(evidenceHighlights) ||
    !Array.isArray(proposedApproach) ||
    !Array.isArray(successMetrics) ||
    !Array.isArray(reviewerConcerns)
  ) {
    throw new Error("Approval summary is malformed.");
  }
  return {
    chosenProblem,
    evidenceHighlights: evidenceHighlights.map(String),
    prioritizationRationale,
    proposedApproach: proposedApproach.map(String),
    successMetrics: successMetrics.map(String),
    reviewerConcerns: reviewerConcerns.map(String),
  };
}
