import type { JsonObject, JsonValue, ToolVersionId } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";
import { isJsonRecord } from "@osva-examples/utils";

import { buildMetricsBundle } from "./fixtures.js";
import {
  analyzeFunnel,
  buildApprovalSummary,
  generateExperiments,
  prioritizeExperiments,
  runDiagnosis,
} from "./growth.js";
import { buildGrowthWorkerRequest, validateGrowthWorkerInput } from "./input.js";
import { renderGrowthBriefMarkdown } from "./report.js";
import type {
  ApprovalSummary,
  ExperimentPrioritization,
  FunnelAnalysis,
  GrowthDiagnosis,
  GrowthMetricsBundle,
  GrowthWorkerRequest,
} from "./types.js";

export const GROWTH_TRAFFIC_TOOL_BINDING = "growth_traffic_tool";
export const GROWTH_FUNNEL_TOOL_BINDING = "growth_funnel_tool";
export const GROWTH_REVENUE_TOOL_BINDING = "growth_revenue_tool";
export const GROWTH_RETENTION_TOOL_BINDING = "growth_retention_tool";
export const GROWTH_CAMPAIGN_TOOL_BINDING = "growth_campaign_tool";

interface ParsedGrowthEnvelope {
  readonly request: GrowthWorkerRequest;
  readonly metrics?: GrowthMetricsBundle;
  readonly funnelAnalysis?: FunnelAnalysis;
  readonly diagnosis?: GrowthDiagnosis;
  readonly experiments?: ReturnType<typeof generateExperiments>;
  readonly prioritization?: ExperimentPrioritization;
  readonly approvalSummary?: ApprovalSummary;
}

export const growthAnalystRuntime = createRuntime({
  execute: async (input, context) => {
    const envelope = parseEnvelope(input);

    if (envelope.metrics === undefined) {
      const metrics = await collectMetricsViaTools(envelope.request.businessId, context);
      return toWorkflowJson({ ...envelope, metrics });
    }

    if (envelope.funnelAnalysis === undefined) {
      const funnelAnalysis = analyzeFunnel(envelope.metrics);
      return toWorkflowJson({ ...envelope, funnelAnalysis });
    }

    if (envelope.diagnosis === undefined) {
      const diagnosis = runDiagnosis(envelope.metrics, envelope.funnelAnalysis);
      return toWorkflowJson({ ...envelope, diagnosis });
    }

    if (envelope.experiments === undefined) {
      const experiments = generateExperiments(envelope.diagnosis.opportunities);
      return toWorkflowJson({ ...envelope, experiments });
    }

    if (envelope.prioritization === undefined) {
      const prioritization = prioritizeExperiments(envelope.experiments, envelope.request.objective);
      const approvalSummary = buildApprovalSummary({
        request: envelope.request,
        metrics: envelope.metrics,
        funnelAnalysis: envelope.funnelAnalysis,
        diagnosis: envelope.diagnosis,
        prioritization,
      });
      return toWorkflowJson({ ...envelope, prioritization, approvalSummary });
    }

    const approvalSummary =
      envelope.approvalSummary ??
      buildApprovalSummary({
        request: envelope.request,
        metrics: envelope.metrics,
        funnelAnalysis: envelope.funnelAnalysis,
        diagnosis: envelope.diagnosis,
        prioritization: envelope.prioritization,
      });

    const markdown = renderGrowthBriefMarkdown({
      request: envelope.request,
      metrics: envelope.metrics,
      funnelAnalysis: envelope.funnelAnalysis,
      diagnosis: envelope.diagnosis,
      prioritization: envelope.prioritization,
      approvalSummary,
    });
    const artifact = await context.artifacts.create({
      name: `growth-brief-${envelope.request.analysisId}.md`,
      mediaType: "text/markdown",
      content: new Blob([markdown], { type: "text/markdown" }),
      metadata: { example: "07-growth-analyst-worker", businessId: envelope.request.businessId },
      idempotencyKey: `growth-brief-${envelope.request.analysisId}`,
    });
    return toWorkflowJson({
      ...envelope,
      approvalSummary,
      report: {
        artifact: artifact.reference,
        name: artifact.name,
        mediaType: artifact.mediaType,
        experimentCount: envelope.prioritization.experiments.length,
        findingCount: envelope.diagnosis.findings.length,
      },
    });
  },
});

interface RuntimeToolContext {
  readonly tools: {
    invoke(input: { binding: string; input: JsonObject; idempotencyKey: string }): Promise<JsonValue>;
  };
}

async function collectMetricsViaTools(businessId: string, context: RuntimeToolContext): Promise<GrowthMetricsBundle> {
  const toolInput = { businessId };
  const idempotencyPrefix = `metrics-${businessId}`;

  const [trafficResult, funnelResult, revenueResult, retentionResult, campaignResult] = await Promise.all([
    context.tools.invoke({
      binding: GROWTH_TRAFFIC_TOOL_BINDING,
      input: toolInput,
      idempotencyKey: `${idempotencyPrefix}-traffic`,
    }),
    context.tools.invoke({
      binding: GROWTH_FUNNEL_TOOL_BINDING,
      input: toolInput,
      idempotencyKey: `${idempotencyPrefix}-funnel`,
    }),
    context.tools.invoke({
      binding: GROWTH_REVENUE_TOOL_BINDING,
      input: toolInput,
      idempotencyKey: `${idempotencyPrefix}-revenue`,
    }),
    context.tools.invoke({
      binding: GROWTH_RETENTION_TOOL_BINDING,
      input: toolInput,
      idempotencyKey: `${idempotencyPrefix}-retention`,
    }),
    context.tools.invoke({
      binding: GROWTH_CAMPAIGN_TOOL_BINDING,
      input: toolInput,
      idempotencyKey: `${idempotencyPrefix}-campaign`,
    }),
  ]);

  const traffic = extractNestedRecord(trafficResult, "traffic");
  const funnel = extractNestedRecord(funnelResult, "funnel");
  const revenue = extractNestedRecord(revenueResult, "revenue");
  const retention = extractNestedRecord(retentionResult, "retention");
  const campaign = extractNestedRecord(campaignResult, "campaign");

  const expected = buildMetricsBundle(businessId);
  return {
    businessId,
    traffic: normalizeTraffic(traffic, expected.traffic),
    funnel: normalizeFunnel(funnel, expected.funnel),
    revenue: normalizeRevenue(revenue, expected.revenue),
    retention: normalizeRetention(retention, expected.retention),
    campaign: normalizeCampaign(campaign, expected.campaign),
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

function normalizeTraffic(raw: JsonObject, expected: GrowthMetricsBundle["traffic"]): GrowthMetricsBundle["traffic"] {
  void expected;
  const sessions = readNumber(raw["sessions"], "traffic.sessions");
  const users = readNumber(raw["users"], "traffic.users");
  const channelBreakdown = readChannelBreakdown(raw["channelBreakdown"]);
  return { sessions, users, channelBreakdown };
}

function normalizeFunnel(raw: JsonObject, expected: GrowthMetricsBundle["funnel"]): GrowthMetricsBundle["funnel"] {
  void expected;
  return {
    sessions: readNumber(raw["sessions"], "funnel.sessions"),
    productViews: readNumber(raw["productViews"], "funnel.productViews"),
    addToCart: readNumber(raw["addToCart"], "funnel.addToCart"),
    checkoutStarted: readNumber(raw["checkoutStarted"], "funnel.checkoutStarted"),
    purchases: readNumber(raw["purchases"], "funnel.purchases"),
  };
}

function normalizeRevenue(raw: JsonObject, expected: GrowthMetricsBundle["revenue"]): GrowthMetricsBundle["revenue"] {
  void expected;
  return {
    orders: readNumber(raw["orders"], "revenue.orders"),
    customers: readNumber(raw["customers"], "revenue.customers"),
    revenue: readNumber(raw["revenue"], "revenue.revenue"),
    refunds: readNumber(raw["refunds"], "revenue.refunds"),
    averageOrderValue: readNumber(raw["averageOrderValue"], "revenue.averageOrderValue"),
  };
}

function normalizeRetention(
  raw: JsonObject,
  expected: GrowthMetricsBundle["retention"],
): GrowthMetricsBundle["retention"] {
  void expected;
  return {
    repeatCustomers: readNumber(raw["repeatCustomers"], "retention.repeatCustomers"),
    repeatPurchaseRate: readNumber(raw["repeatPurchaseRate"], "retention.repeatPurchaseRate"),
  };
}

function normalizeCampaign(
  raw: JsonObject,
  expected: GrowthMetricsBundle["campaign"],
): GrowthMetricsBundle["campaign"] {
  void expected;
  return {
    spend: readNumber(raw["spend"], "campaign.spend"),
    clicks: readNumber(raw["clicks"], "campaign.clicks"),
    paidConversions: readNumber(raw["paidConversions"], "campaign.paidConversions"),
    paidRevenue: readNumber(raw["paidRevenue"], "campaign.paidRevenue"),
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

function readChannelBreakdown(value: JsonValue | undefined): GrowthMetricsBundle["traffic"]["channelBreakdown"] {
  if (!Array.isArray(value)) {
    throw new Error("traffic.channelBreakdown must be an array.");
  }
  return value.map((item, index) => {
    if (!isJsonRecord(item)) {
      throw new Error(`traffic.channelBreakdown[${index}] must be an object.`);
    }
    const channel = item["channel"];
    const sessions = item["sessions"];
    if (typeof channel !== "string" || typeof sessions !== "number") {
      throw new Error(`traffic.channelBreakdown[${index}] is malformed.`);
    }
    return { channel, sessions };
  });
}

export function buildGrowthAnalystAgentManifest(
  runtimeUrl: string,
  toolVersionIds: {
    readonly traffic: ToolVersionId;
    readonly funnel: ToolVersionId;
    readonly revenue: ToolVersionId;
    readonly retention: ToolVersionId;
    readonly campaign: ToolVersionId;
  },
) {
  return {
    schemaVersion: "1" as const,
    key: "growth-analyst-agent",
    name: "Growth Analyst Agent",
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
              analysisId: { type: "string" },
              businessId: { type: "string" },
              objective: { type: "string" },
              context: { type: "string" },
            },
            required: ["analysisId", "businessId"],
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
        GROWTH_TRAFFIC_TOOL_BINDING,
        GROWTH_FUNNEL_TOOL_BINDING,
        GROWTH_REVENUE_TOOL_BINDING,
        GROWTH_RETENTION_TOOL_BINDING,
        GROWTH_CAMPAIGN_TOOL_BINDING,
      ],
    },
    tools: {
      [GROWTH_TRAFFIC_TOOL_BINDING]: { toolVersionId: toolVersionIds.traffic },
      [GROWTH_FUNNEL_TOOL_BINDING]: { toolVersionId: toolVersionIds.funnel },
      [GROWTH_REVENUE_TOOL_BINDING]: { toolVersionId: toolVersionIds.revenue },
      [GROWTH_RETENTION_TOOL_BINDING]: { toolVersionId: toolVersionIds.retention },
      [GROWTH_CAMPAIGN_TOOL_BINDING]: { toolVersionId: toolVersionIds.campaign },
    },
  };
}

export function parseEnvelope(input: JsonValue): ParsedGrowthEnvelope {
  if (!isJsonRecord(input)) {
    throw new Error("Workflow input must be an object.");
  }
  const requestRaw = input["request"];
  if (requestRaw === undefined || !isJsonRecord(requestRaw)) {
    throw new Error("Workflow envelope is missing request.");
  }
  if (typeof requestRaw["analysisId"] !== "string") {
    throw new Error("Workflow request must include analysisId.");
  }
  const validated = validateGrowthWorkerInput({
    businessId: requestRaw["businessId"],
    objective: requestRaw["objective"],
    context: requestRaw["context"],
  });
  const request = buildGrowthWorkerRequest(validated, requestRaw["analysisId"]);

  const envelope: ParsedGrowthEnvelope = { request };

  const metricsRaw = input["metrics"];
  if (metricsRaw === undefined) {
    return envelope;
  }
  const metrics = parseMetrics(metricsRaw, request.businessId);

  const funnelRaw = input["funnelAnalysis"];
  if (funnelRaw === undefined) {
    return { ...envelope, metrics };
  }
  const funnelAnalysis = parseFunnelAnalysis(funnelRaw);

  const diagnosisRaw = input["diagnosis"];
  if (diagnosisRaw === undefined) {
    return { ...envelope, metrics, funnelAnalysis };
  }
  const diagnosis = parseDiagnosis(diagnosisRaw);

  const experimentsRaw = input["experiments"];
  if (experimentsRaw === undefined) {
    return { ...envelope, metrics, funnelAnalysis, diagnosis };
  }
  const experiments = parseExperiments(experimentsRaw);

  const prioritizationRaw = input["prioritization"];
  if (prioritizationRaw === undefined) {
    return { ...envelope, metrics, funnelAnalysis, diagnosis, experiments };
  }
  const prioritization = parsePrioritization(prioritizationRaw);

  const approvalSummaryRaw = input["approvalSummary"];
  const approvalSummary = approvalSummaryRaw === undefined ? undefined : parseApprovalSummary(approvalSummaryRaw);

  return { ...envelope, metrics, funnelAnalysis, diagnosis, experiments, prioritization, approvalSummary };
}

function toWorkflowJson(
  envelope: ParsedGrowthEnvelope & {
    readonly report?: JsonObject;
  },
): JsonObject {
  const request: JsonObject = {
    analysisId: envelope.request.analysisId,
    businessId: envelope.request.businessId,
    ...(envelope.request.objective === undefined ? {} : { objective: envelope.request.objective }),
    ...(envelope.request.context === undefined ? {} : { context: envelope.request.context }),
  };

  return {
    request,
    ...(envelope.metrics === undefined ? {} : { metrics: metricsToJson(envelope.metrics) }),
    ...(envelope.funnelAnalysis === undefined ? {} : { funnelAnalysis: funnelAnalysisToJson(envelope.funnelAnalysis) }),
    ...(envelope.diagnosis === undefined ? {} : { diagnosis: diagnosisToJson(envelope.diagnosis) }),
    ...(envelope.experiments === undefined ? {} : { experiments: envelope.experiments.map(experimentToJson) }),
    ...(envelope.prioritization === undefined ? {} : { prioritization: prioritizationToJson(envelope.prioritization) }),
    ...(envelope.approvalSummary === undefined
      ? {}
      : { approvalSummary: approvalSummaryToJson(envelope.approvalSummary) }),
    ...(envelope.report === undefined ? {} : { report: envelope.report }),
  };
}

function metricsToJson(metrics: GrowthMetricsBundle): JsonObject {
  return {
    businessId: metrics.businessId,
    traffic: {
      sessions: metrics.traffic.sessions,
      users: metrics.traffic.users,
      channelBreakdown: metrics.traffic.channelBreakdown.map((entry) => ({
        channel: entry.channel,
        sessions: entry.sessions,
      })),
    },
    funnel: { ...metrics.funnel },
    revenue: { ...metrics.revenue },
    retention: { ...metrics.retention },
    campaign: { ...metrics.campaign },
  };
}

function funnelAnalysisToJson(analysis: FunnelAnalysis): JsonObject {
  return {
    rates: { ...analysis.rates },
    summary: analysis.summary,
  };
}

function diagnosisToJson(diagnosis: GrowthDiagnosis): JsonObject {
  return {
    findings: diagnosis.findings.map((finding) => ({ ...finding })),
    opportunities: diagnosis.opportunities.map((opportunity) => ({
      ...opportunity,
      supportingFindingIds: [...opportunity.supportingFindingIds],
    })),
  };
}

function experimentToJson(experiment: ReturnType<typeof generateExperiments>[number]): JsonObject {
  return {
    ...experiment,
    supportingOpportunityIds: [...experiment.supportingOpportunityIds],
  };
}

function prioritizationToJson(prioritization: ExperimentPrioritization): JsonObject {
  return {
    method: prioritization.method,
    experiments: prioritization.experiments.map((experiment) => ({
      ...experiment,
      supportingOpportunityIds: [...experiment.supportingOpportunityIds],
    })),
  };
}

function approvalSummaryToJson(summary: ApprovalSummary): JsonObject {
  return {
    headlineIssues: [...summary.headlineIssues],
    topOpportunity: summary.topOpportunity,
    topExperiments: [...summary.topExperiments],
    keyMetrics: [...summary.keyMetrics],
  };
}

function parseMetrics(raw: JsonValue, businessId: string): GrowthMetricsBundle {
  if (!isJsonRecord(raw)) {
    throw new Error("Metrics must be an object.");
  }
  if (typeof raw["businessId"] === "string" && raw["businessId"] !== businessId) {
    throw new Error("Metrics businessId does not match request.");
  }
  const bundle = buildMetricsBundle(businessId);
  const trafficRaw = readRequiredRecord(raw["traffic"], "metrics.traffic");
  const funnelRaw = readRequiredRecord(raw["funnel"], "metrics.funnel");
  const revenueRaw = readRequiredRecord(raw["revenue"], "metrics.revenue");
  const retentionRaw = readRequiredRecord(raw["retention"], "metrics.retention");
  const campaignRaw = readRequiredRecord(raw["campaign"], "metrics.campaign");
  return {
    businessId,
    traffic: normalizeTraffic(trafficRaw, bundle.traffic),
    funnel: normalizeFunnel(funnelRaw, bundle.funnel),
    revenue: normalizeRevenue(revenueRaw, bundle.revenue),
    retention: normalizeRetention(retentionRaw, bundle.retention),
    campaign: normalizeCampaign(campaignRaw, bundle.campaign),
  };
}

function parseFunnelAnalysis(raw: JsonValue): FunnelAnalysis {
  if (!isJsonRecord(raw)) {
    throw new Error("Funnel analysis must be an object.");
  }
  const summary = raw["summary"];
  const ratesRaw = readRequiredRecord(raw["rates"], "funnelAnalysis.rates");
  if (typeof summary !== "string") {
    throw new Error("Funnel analysis is malformed.");
  }
  return {
    summary,
    rates: {
      sessionToProductViewRate: readNullableRate(ratesRaw["sessionToProductViewRate"]),
      productViewToCartRate: readNullableRate(ratesRaw["productViewToCartRate"]),
      cartToCheckoutRate: readNullableRate(ratesRaw["cartToCheckoutRate"]),
      checkoutToPurchaseRate: readNullableRate(ratesRaw["checkoutToPurchaseRate"]),
      sessionToPurchaseRate: readNullableRate(ratesRaw["sessionToPurchaseRate"]),
      cac: readNullableRate(ratesRaw["cac"]),
      roas: readNullableRate(ratesRaw["roas"]),
      refundRate: readNullableRate(ratesRaw["refundRate"]),
    },
  };
}

function readNullableRate(value: JsonValue | undefined): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error("Funnel rate must be a finite number or null.");
}

function parseDiagnosis(raw: JsonValue): GrowthDiagnosis {
  if (!isJsonRecord(raw)) {
    throw new Error("Diagnosis must be an object.");
  }
  const findingsRaw = raw["findings"];
  const opportunitiesRaw = raw["opportunities"];
  if (!Array.isArray(findingsRaw) || !Array.isArray(opportunitiesRaw)) {
    throw new Error("Diagnosis is malformed.");
  }
  return {
    findings: findingsRaw.map(parseFinding),
    opportunities: opportunitiesRaw.map(parseOpportunity),
  };
}

function parseFinding(raw: JsonValue): GrowthDiagnosis["findings"][number] {
  if (!isJsonRecord(raw)) {
    throw new Error("Finding must be an object.");
  }
  const id = raw["id"];
  const area = raw["area"];
  const finding = raw["finding"];
  const evidence = raw["evidence"];
  const severity = raw["severity"];
  if (
    typeof id !== "string" ||
    typeof finding !== "string" ||
    typeof evidence !== "string" ||
    (area !== "acquisition" &&
      area !== "activation" &&
      area !== "conversion" &&
      area !== "retention" &&
      area !== "revenue") ||
    (severity !== "high" && severity !== "medium" && severity !== "low")
  ) {
    throw new Error("Finding is malformed.");
  }
  return { id, area, finding, evidence, severity };
}

function parseOpportunity(raw: JsonValue): GrowthDiagnosis["opportunities"][number] {
  if (!isJsonRecord(raw)) {
    throw new Error("Opportunity must be an object.");
  }
  const id = raw["id"];
  const problem = raw["problem"];
  const hypothesis = raw["hypothesis"];
  const expectedOutcome = raw["expectedOutcome"];
  const supportingFindingIds = raw["supportingFindingIds"];
  if (
    typeof id !== "string" ||
    typeof problem !== "string" ||
    typeof hypothesis !== "string" ||
    typeof expectedOutcome !== "string" ||
    !Array.isArray(supportingFindingIds)
  ) {
    throw new Error("Opportunity is malformed.");
  }
  return {
    id,
    problem,
    hypothesis,
    expectedOutcome,
    supportingFindingIds: supportingFindingIds.map(String),
  };
}

function parseExperiments(raw: JsonValue): ReturnType<typeof generateExperiments> {
  if (!Array.isArray(raw)) {
    throw new Error("Experiments must be an array.");
  }
  return raw.map(parseExperiment);
}

function parseExperiment(raw: JsonValue): ReturnType<typeof generateExperiments>[number] {
  if (!isJsonRecord(raw)) {
    throw new Error("Experiment must be an object.");
  }
  const id = raw["id"];
  const title = raw["title"];
  const hypothesis = raw["hypothesis"];
  const targetMetric = raw["targetMetric"];
  const expectedDirection = raw["expectedDirection"];
  const supportingOpportunityIds = raw["supportingOpportunityIds"];
  const effort = raw["effort"];
  const impact = raw["impact"];
  const confidence = raw["confidence"];
  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    typeof hypothesis !== "string" ||
    typeof targetMetric !== "string" ||
    (expectedDirection !== "increase" && expectedDirection !== "decrease") ||
    !Array.isArray(supportingOpportunityIds) ||
    (effort !== "low" && effort !== "medium" && effort !== "high") ||
    (impact !== "low" && impact !== "medium" && impact !== "high") ||
    (confidence !== "low" && confidence !== "medium" && confidence !== "high")
  ) {
    throw new Error("Experiment is malformed.");
  }
  return {
    id,
    title,
    hypothesis,
    targetMetric,
    expectedDirection,
    supportingOpportunityIds: supportingOpportunityIds.map(String),
    effort,
    impact,
    confidence,
  };
}

function parsePrioritization(raw: JsonValue): ExperimentPrioritization {
  if (!isJsonRecord(raw)) {
    throw new Error("Prioritization must be an object.");
  }
  const method = raw["method"];
  const experimentsRaw = raw["experiments"];
  if (typeof method !== "string" || !Array.isArray(experimentsRaw)) {
    throw new Error("Prioritization is malformed.");
  }
  return {
    method,
    experiments: experimentsRaw.map((item) => {
      const experiment = parseExperiment(item);
      if (!isJsonRecord(item)) {
        throw new Error("Prioritized experiment must be an object.");
      }
      const priorityScore = item["priorityScore"];
      const priorityRank = item["priorityRank"];
      const rationale = item["rationale"];
      if (typeof priorityScore !== "number" || typeof priorityRank !== "number" || typeof rationale !== "string") {
        throw new Error("Prioritized experiment is malformed.");
      }
      return { ...experiment, priorityScore, priorityRank, rationale };
    }),
  };
}

function parseApprovalSummary(raw: JsonValue): ApprovalSummary {
  if (!isJsonRecord(raw)) {
    throw new Error("Approval summary must be an object.");
  }
  const headlineIssues = raw["headlineIssues"];
  const topOpportunity = raw["topOpportunity"];
  const topExperiments = raw["topExperiments"];
  const keyMetrics = raw["keyMetrics"];
  if (
    !Array.isArray(headlineIssues) ||
    typeof topOpportunity !== "string" ||
    !Array.isArray(topExperiments) ||
    !Array.isArray(keyMetrics)
  ) {
    throw new Error("Approval summary is malformed.");
  }
  return {
    headlineIssues: headlineIssues.map(String),
    topOpportunity,
    topExperiments: topExperiments.map(String),
    keyMetrics: keyMetrics.map(String),
  };
}
