import type { JsonObject, JsonValue, ToolVersionId } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";
import { isJsonRecord } from "@osva-examples/utils";

import {
  actionAllowedAfterApproval,
  analyzeCustomerSignals,
  buildApprovalSummary,
  buildEvidenceRecords,
  buildResearchContext,
  diagnoseGrowthConstraint,
  findOpportunity,
  generateOpportunities,
  prepareAction,
  runCriticReview,
  selectIntervention,
  verifyExecution,
} from "./analysis.js";
import { buildSignalBundle } from "./fixtures.js";
import { buildGrowthOpsWorkerRequest, validateGrowthOpsWorkerInput } from "./input.js";
import { renderGrowthOperationsBriefMarkdown } from "./report.js";
import type {
  ActionExecutionResult,
  ApprovalDecisionRecord,
  ApprovalSummary,
  CriticReview,
  CustomerInsightAnalysis,
  EvidenceRecord,
  ExecutionVerification,
  GrowthDiagnosis,
  GrowthOpportunity,
  GrowthOpsWorkerRequest,
  GrowthSignalBundle,
  InterventionRoute,
  PreparedAction,
  ResearchContext,
  SelectedIntervention,
} from "./types.js";

export const COMMERCE_TOOL_BINDING = "growth_ops_commerce_tool";
export const FUNNEL_TOOL_BINDING = "growth_ops_funnel_tool";
export const CAMPAIGN_TOOL_BINDING = "growth_ops_campaign_tool";
export const CUSTOMER_TOOL_BINDING = "growth_ops_customer_tool";
export const CONTENT_TOOL_BINDING = "growth_ops_content_tool";
export const PRODUCT_TOOL_BINDING = "growth_ops_product_tool";
export const EXECUTE_DEMO_TOOL_BINDING = "growth_ops_execute_tool";

interface ParsedGrowthOpsEnvelope {
  readonly request: GrowthOpsWorkerRequest;
  readonly signals?: GrowthSignalBundle;
  readonly evidence?: readonly EvidenceRecord[];
  readonly diagnosis?: GrowthDiagnosis;
  readonly customerInsight?: CustomerInsightAnalysis;
  readonly researchContext?: ResearchContext;
  readonly opportunities?: readonly GrowthOpportunity[];
  readonly criticReview?: CriticReview;
  readonly selectedIntervention?: SelectedIntervention;
  readonly interventionRoute?: InterventionRoute;
  readonly preparedAction?: PreparedAction;
  readonly approvalSummary?: ApprovalSummary;
  readonly approvalDecision?: ApprovalDecisionRecord;
  readonly actionResult?: ActionExecutionResult;
  readonly executionVerification?: ExecutionVerification;
}

interface RuntimeToolContext {
  readonly tools: {
    invoke(input: { binding: string; input: JsonObject; idempotencyKey: string }): Promise<JsonValue>;
  };
}

export const growthOperationsRuntime = createRuntime({
  execute: async (input, context) => {
    const envelope = parseEnvelope(input);

    if (envelope.signals === undefined) {
      const signals = await collectSignals(envelope.request.businessId, context);
      const evidence = buildEvidenceRecords(signals);
      return toWorkflowJson({ ...envelope, signals, evidence });
    }

    if (envelope.diagnosis === undefined) {
      const diagnosis = diagnoseGrowthConstraint(
        envelope.request.objective,
        envelope.signals,
        envelope.evidence ?? buildEvidenceRecords(envelope.signals),
      );
      return toWorkflowJson({ ...envelope, diagnosis });
    }

    if (envelope.customerInsight === undefined) {
      const customerInsight = analyzeCustomerSignals(
        envelope.signals,
        envelope.evidence ?? buildEvidenceRecords(envelope.signals),
      );
      return toWorkflowJson({ ...envelope, customerInsight });
    }

    if (envelope.researchContext === undefined) {
      const researchContext = buildResearchContext(
        envelope.diagnosis,
        envelope.evidence ?? buildEvidenceRecords(envelope.signals),
      );
      return toWorkflowJson({ ...envelope, researchContext });
    }

    if (envelope.opportunities === undefined) {
      const opportunities = generateOpportunities(
        envelope.diagnosis,
        envelope.evidence ?? buildEvidenceRecords(envelope.signals),
      );
      return toWorkflowJson({ ...envelope, opportunities });
    }

    if (envelope.criticReview === undefined) {
      const criticReview = runCriticReview(envelope.opportunities, envelope.diagnosis, envelope.request.objective);
      return toWorkflowJson({ ...envelope, criticReview });
    }

    if (envelope.selectedIntervention === undefined) {
      const selectedIntervention = selectIntervention(
        envelope.opportunities,
        envelope.criticReview,
        envelope.request.objective,
      );
      return toWorkflowJson({
        ...envelope,
        selectedIntervention,
        interventionRoute: selectedIntervention.interventionRoute,
      });
    }

    if (envelope.preparedAction === undefined) {
      const opportunity = findOpportunity(envelope.opportunities, envelope.selectedIntervention.opportunityId);
      if (opportunity === undefined) {
        throw new Error("Selected opportunity was not found in opportunity list.");
      }
      const route = envelope.interventionRoute ?? envelope.selectedIntervention.interventionRoute;
      const preparedAction = prepareAction(envelope.request, opportunity, route);
      const approvalSummary = buildApprovalSummary({
        diagnosis: envelope.diagnosis,
        evidence: envelope.evidence ?? buildEvidenceRecords(envelope.signals),
        opportunity,
        critic: envelope.criticReview,
        prepared: preparedAction,
      });
      return toWorkflowJson({ ...envelope, preparedAction, approvalSummary });
    }

    if (envelope.actionResult === undefined) {
      if (envelope.preparedAction === undefined) {
        throw new Error("Prepared action is required before execution.");
      }
      const actionResult = await executePreparedAction(
        { ...envelope, preparedAction: envelope.preparedAction, request: envelope.request },
        context,
      );
      return toWorkflowJson({ ...envelope, actionResult });
    }

    if (envelope.executionVerification === undefined) {
      const executionVerification = verifyExecution(
        envelope.preparedAction.actionId,
        envelope.preparedAction.monitoringMetric,
      );
      return toWorkflowJson({ ...envelope, executionVerification });
    }

    const markdown = renderGrowthOperationsBriefMarkdown({
      request: envelope.request,
      signals: envelope.signals,
      evidence: envelope.evidence ?? buildEvidenceRecords(envelope.signals),
      diagnosis: envelope.diagnosis,
      customerInsight: envelope.customerInsight,
      research: envelope.researchContext,
      opportunities: envelope.opportunities,
      critic: envelope.criticReview,
      selected: envelope.selectedIntervention,
      prepared: envelope.preparedAction,
      approvalSummary:
        envelope.approvalSummary ??
        buildApprovalSummary({
          diagnosis: envelope.diagnosis,
          evidence: envelope.evidence ?? buildEvidenceRecords(envelope.signals),
          opportunity: requireOpportunity(envelope.opportunities, envelope.selectedIntervention.opportunityId),
          critic: envelope.criticReview,
          prepared: envelope.preparedAction,
        }),
      approvalDecision: envelope.approvalDecision,
      actionResult: envelope.actionResult,
      verification: envelope.executionVerification,
    });
    const artifact = await context.artifacts.create({
      name: `growth-operations-brief-${envelope.request.runId}.md`,
      mediaType: "text/markdown",
      content: new Blob([markdown], { type: "text/markdown" }),
      metadata: { example: "11-growth-operations-worker", businessId: envelope.request.businessId },
      idempotencyKey: `growth-ops-brief-${envelope.request.runId}`,
    });
    return toWorkflowJson({
      ...envelope,
      report: {
        artifact: artifact.reference,
        name: artifact.name,
        mediaType: artifact.mediaType,
        opportunityCount: envelope.opportunities.length,
        interventionRoute: envelope.interventionRoute ?? envelope.selectedIntervention.interventionRoute,
      },
    });
  },
});

function requireOpportunity(opportunities: readonly GrowthOpportunity[], opportunityId: string): GrowthOpportunity {
  const opportunity = findOpportunity(opportunities, opportunityId);
  if (opportunity === undefined) {
    throw new Error(`Opportunity ${opportunityId} was not found.`);
  }
  return opportunity;
}

async function collectSignals(businessId: string, context: RuntimeToolContext): Promise<GrowthSignalBundle> {
  const toolInput = { businessId };
  const prefix = `signals-${businessId}`;
  const [commerce, funnel, campaign, customer, content, products] = await Promise.all([
    context.tools.invoke({ binding: COMMERCE_TOOL_BINDING, input: toolInput, idempotencyKey: `${prefix}-commerce` }),
    context.tools.invoke({ binding: FUNNEL_TOOL_BINDING, input: toolInput, idempotencyKey: `${prefix}-funnel` }),
    context.tools.invoke({ binding: CAMPAIGN_TOOL_BINDING, input: toolInput, idempotencyKey: `${prefix}-campaign` }),
    context.tools.invoke({ binding: CUSTOMER_TOOL_BINDING, input: toolInput, idempotencyKey: `${prefix}-customer` }),
    context.tools.invoke({ binding: CONTENT_TOOL_BINDING, input: toolInput, idempotencyKey: `${prefix}-content` }),
    context.tools.invoke({ binding: PRODUCT_TOOL_BINDING, input: toolInput, idempotencyKey: `${prefix}-product` }),
  ]);

  void buildSignalBundle(businessId);
  return {
    businessId,
    commerce: normalizeCommerce(extractNested(commerce, "commerce")),
    funnel: normalizeFunnel(extractNested(funnel, "funnel")),
    campaign: normalizeCampaign(extractNested(campaign, "campaign")),
    customerSignals: normalizeCustomerSignals(extractArray(customer, "customerSignals")),
    contentSignals: normalizeContentSignals(extractArray(content, "contentSignals")),
    products: normalizeProducts(extractArray(products, "products")),
  };
}

async function executePreparedAction(
  envelope: ParsedGrowthOpsEnvelope & {
    readonly preparedAction: PreparedAction;
    readonly request: GrowthOpsWorkerRequest;
  },
  context: RuntimeToolContext,
): Promise<ActionExecutionResult> {
  const prepared = envelope.preparedAction;
  if (!actionAllowedAfterApproval(envelope.approvalDecision)) {
    return {
      actionId: prepared.actionId,
      status: "rejected",
      details: "Human reviewer rejected the proposed growth action.",
      monitoringMetric: prepared.monitoringMetric,
    };
  }

  const toolResult = await context.tools.invoke({
    binding: EXECUTE_DEMO_TOOL_BINDING,
    input: {
      businessId: envelope.request.businessId,
      actionId: prepared.actionId,
      actionType: prepared.actionType,
      title: prepared.title,
      monitoringMetric: prepared.monitoringMetric,
    },
    idempotencyKey: prepared.actionId,
  });
  const result = extractNested(toolResult, "result");
  const status = readActionStatus(result);
  const details = typeof result["details"] === "string" ? result["details"] : "Demo action finished.";
  return {
    actionId: prepared.actionId,
    status,
    details,
    monitoringMetric: prepared.monitoringMetric,
  };
}

function readActionStatus(record: JsonObject): ActionExecutionResult["status"] {
  const status = record["status"];
  if (status === "completed" || status === "already-completed" || status === "rejected") {
    return status;
  }
  throw new Error("Demo action result status is invalid.");
}

function extractNested(raw: JsonValue, field: string): JsonObject {
  if (!isJsonRecord(raw)) throw new Error(`Expected object for ${field}.`);
  const nested = raw[field];
  if (nested === undefined || !isJsonRecord(nested)) throw new Error(`Missing ${field}.`);
  return nested;
}

function extractArray(raw: JsonValue, field: string): JsonValue[] {
  if (!isJsonRecord(raw)) throw new Error(`Expected object for ${field}.`);
  const nested = raw[field];
  if (!Array.isArray(nested)) throw new Error(`Missing array ${field}.`);
  return nested;
}

function normalizeCommerce(raw: JsonObject): GrowthSignalBundle["commerce"] {
  return {
    orders: readNumber(raw["orders"]),
    revenue: readNumber(raw["revenue"]),
    averageOrderValue: readNumber(raw["averageOrderValue"]),
    refundRate: readNumber(raw["refundRate"]),
  };
}

function normalizeFunnel(raw: JsonObject): GrowthSignalBundle["funnel"] {
  return {
    sessions: readNumber(raw["sessions"]),
    productViews: readNumber(raw["productViews"]),
    addToCart: readNumber(raw["addToCart"]),
    checkoutStarted: readNumber(raw["checkoutStarted"]),
    purchases: readNumber(raw["purchases"]),
  };
}

function normalizeCampaign(raw: JsonObject): GrowthSignalBundle["campaign"] {
  return {
    spend: readNumber(raw["spend"]),
    clicks: readNumber(raw["clicks"]),
    paidConversions: readNumber(raw["paidConversions"]),
    paidRevenue: readNumber(raw["paidRevenue"]),
  };
}

function normalizeCustomerSignals(raw: JsonValue[]): GrowthSignalBundle["customerSignals"] {
  return raw.map((item) => {
    if (!isJsonRecord(item)) throw new Error("Customer signal malformed.");
    return {
      id: String(item["id"]),
      theme: String(item["theme"]),
      sentiment: item["sentiment"] as "negative" | "neutral" | "positive",
      excerpt: String(item["excerpt"]),
      volume: readNumber(item["volume"]),
    };
  });
}

function normalizeContentSignals(raw: JsonValue[]): GrowthSignalBundle["contentSignals"] {
  return raw.map((item) => {
    if (!isJsonRecord(item)) throw new Error("Content signal malformed.");
    return {
      pageId: String(item["pageId"]),
      path: String(item["path"]),
      impressions: readNumber(item["impressions"]),
      ctr: readNumber(item["ctr"]),
      avgPosition: readNumber(item["avgPosition"]),
    };
  });
}

function normalizeProducts(raw: JsonValue[]): GrowthSignalBundle["products"] {
  return raw.map((item) => {
    if (!isJsonRecord(item)) throw new Error("Product context malformed.");
    return {
      sku: String(item["sku"]),
      name: String(item["name"]),
      inventoryUnits: readNumber(item["inventoryUnits"]),
      marginPercent: readNumber(item["marginPercent"]),
    };
  });
}

function readNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Expected finite number.");
  }
  return value;
}

export function buildGrowthOperationsAgentManifest(
  runtimeUrl: string,
  toolVersionIds: {
    readonly commerce: ToolVersionId;
    readonly funnel: ToolVersionId;
    readonly campaign: ToolVersionId;
    readonly customer: ToolVersionId;
    readonly content: ToolVersionId;
    readonly product: ToolVersionId;
    readonly execute: ToolVersionId;
  },
) {
  return {
    schemaVersion: "1" as const,
    key: "growth-operations-agent",
    name: "Growth Operations Agent",
    runtime: {
      type: "REMOTE_HTTP" as const,
      protocolVersion: "1" as const,
      endpoint: runtimeUrl,
      timeoutMs: 60_000,
    },
    input: {
      schema: {
        type: "object",
        properties: {
          request: {
            type: "object",
            properties: {
              runId: { type: "string" },
              businessId: { type: "string" },
              objective: { type: "string" },
              context: { type: "string" },
            },
            required: ["runId", "businessId", "objective"],
          },
        },
        required: ["request"],
      },
    },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 60_000, maxAttempts: 1 },
    capabilities: {
      model: false,
      tools: [
        COMMERCE_TOOL_BINDING,
        FUNNEL_TOOL_BINDING,
        CAMPAIGN_TOOL_BINDING,
        CUSTOMER_TOOL_BINDING,
        CONTENT_TOOL_BINDING,
        PRODUCT_TOOL_BINDING,
        EXECUTE_DEMO_TOOL_BINDING,
      ],
    },
    tools: {
      [COMMERCE_TOOL_BINDING]: { toolVersionId: toolVersionIds.commerce },
      [FUNNEL_TOOL_BINDING]: { toolVersionId: toolVersionIds.funnel },
      [CAMPAIGN_TOOL_BINDING]: { toolVersionId: toolVersionIds.campaign },
      [CUSTOMER_TOOL_BINDING]: { toolVersionId: toolVersionIds.customer },
      [CONTENT_TOOL_BINDING]: { toolVersionId: toolVersionIds.content },
      [PRODUCT_TOOL_BINDING]: { toolVersionId: toolVersionIds.product },
      [EXECUTE_DEMO_TOOL_BINDING]: { toolVersionId: toolVersionIds.execute },
    },
  };
}

export function parseEnvelope(input: JsonValue): ParsedGrowthOpsEnvelope {
  if (!isJsonRecord(input)) throw new Error("Workflow input must be an object.");
  const requestRaw = input["request"];
  if (requestRaw === undefined || !isJsonRecord(requestRaw)) throw new Error("Missing request.");
  const validated = validateGrowthOpsWorkerInput({
    businessId: requestRaw["businessId"],
    objective: requestRaw["objective"],
    ...(requestRaw["context"] === undefined ? {} : { context: requestRaw["context"] }),
  });
  const runId = typeof requestRaw["runId"] === "string" ? requestRaw["runId"] : "";
  if (runId.length < 8) {
    throw new Error("request.runId must be at least 8 characters.");
  }
  const request = buildGrowthOpsWorkerRequest(validated, runId);
  const envelope: ParsedGrowthOpsEnvelope = { request };

  if (input["signals"] === undefined) return envelope;
  const signals = parseSignals(input["signals"], request.businessId);
  const evidence = input["evidence"] === undefined ? undefined : parseEvidence(input["evidence"]);
  const withSignals = { ...envelope, signals, ...(evidence === undefined ? {} : { evidence }) };
  if (input["diagnosis"] === undefined) return withSignals;

  const withDiagnosis = { ...withSignals, diagnosis: parseDiagnosis(input["diagnosis"]) };
  if (input["customerInsight"] === undefined) return withDiagnosis;

  const withCustomer = { ...withDiagnosis, customerInsight: parseCustomerInsight(input["customerInsight"]) };
  if (input["researchContext"] === undefined) return withCustomer;

  const withResearch = { ...withCustomer, researchContext: parseResearch(input["researchContext"]) };
  if (input["opportunities"] === undefined) return withResearch;

  const withOpportunities = { ...withResearch, opportunities: parseOpportunities(input["opportunities"]) };
  if (input["criticReview"] === undefined) return withOpportunities;

  const withCritic = { ...withOpportunities, criticReview: parseCritic(input["criticReview"]) };
  if (input["selectedIntervention"] === undefined) return withCritic;

  const selectedIntervention = parseSelected(input["selectedIntervention"]);
  const routeRaw = input["interventionRoute"];
  const interventionRoute =
    routeRaw === "content-action" ||
    routeRaw === "campaign-action" ||
    routeRaw === "conversion-action" ||
    routeRaw === "retention-action" ||
    routeRaw === "monitor-only"
      ? routeRaw
      : selectedIntervention.interventionRoute;
  const withSelected = { ...withCritic, selectedIntervention, interventionRoute };
  if (input["preparedAction"] === undefined) return withSelected;

  const preparedAction = parsePreparedAction(input["preparedAction"]);
  const approvalSummary =
    input["approvalSummary"] === undefined ? undefined : parseApprovalSummary(input["approvalSummary"]);
  const withPrepared = {
    ...withSelected,
    preparedAction,
    ...(approvalSummary === undefined ? {} : { approvalSummary }),
    ...(input["approvalDecision"] === undefined
      ? {}
      : { approvalDecision: parseApprovalDecision(input["approvalDecision"]) }),
  };
  if (input["actionResult"] === undefined) return withPrepared;

  const withAction = { ...withPrepared, actionResult: parseActionResult(input["actionResult"]) };
  if (input["executionVerification"] === undefined) return withAction;

  return { ...withAction, executionVerification: parseExecutionVerification(input["executionVerification"]) };
}

function toWorkflowJson(envelope: ParsedGrowthOpsEnvelope & { readonly report?: JsonObject }): JsonObject {
  return {
    request: { ...envelope.request },
    ...(envelope.signals === undefined ? {} : { signals: signalsToJson(envelope.signals) }),
    ...(envelope.evidence === undefined ? {} : { evidence: envelope.evidence.map((item) => ({ ...item })) }),
    ...(envelope.diagnosis === undefined
      ? {}
      : { diagnosis: { ...envelope.diagnosis, evidenceIds: [...envelope.diagnosis.evidenceIds] } }),
    ...(envelope.customerInsight === undefined
      ? {}
      : {
          customerInsight: {
            ...envelope.customerInsight,
            topThemes: [...envelope.customerInsight.topThemes],
            supportingEvidenceIds: [...envelope.customerInsight.supportingEvidenceIds],
          },
        }),
    ...(envelope.researchContext === undefined
      ? {}
      : {
          researchContext: {
            ...envelope.researchContext,
            notes: [...envelope.researchContext.notes],
            supportingEvidenceIds: [...envelope.researchContext.supportingEvidenceIds],
          },
        }),
    ...(envelope.opportunities === undefined
      ? {}
      : {
          opportunities: envelope.opportunities.map((item) => ({
            ...item,
            supportingEvidenceIds: [...item.supportingEvidenceIds],
          })),
        }),
    ...(envelope.criticReview === undefined
      ? {}
      : {
          criticReview: {
            issues: envelope.criticReview.issues.map((item) => ({ ...item })),
            adjustedOpportunities: envelope.criticReview.adjustedOpportunities.map((item) => ({ ...item })),
          },
        }),
    ...(envelope.selectedIntervention === undefined
      ? {}
      : { selectedIntervention: { ...envelope.selectedIntervention } }),
    ...(envelope.interventionRoute === undefined ? {} : { interventionRoute: envelope.interventionRoute }),
    ...(envelope.preparedAction === undefined ? {} : { preparedAction: { ...envelope.preparedAction } }),
    ...(envelope.approvalSummary === undefined
      ? {}
      : {
          approvalSummary: {
            ...envelope.approvalSummary,
            evidenceHighlights: [...envelope.approvalSummary.evidenceHighlights],
          },
        }),
    ...(envelope.approvalDecision === undefined ? {} : { approvalDecision: { ...envelope.approvalDecision } }),
    ...(envelope.actionResult === undefined ? {} : { actionResult: { ...envelope.actionResult } }),
    ...(envelope.executionVerification === undefined
      ? {}
      : {
          executionVerification: {
            ...envelope.executionVerification,
            notes: [...envelope.executionVerification.notes],
          },
        }),
    ...(envelope.report === undefined ? {} : { report: envelope.report }),
  };
}

function signalsToJson(signals: GrowthSignalBundle): JsonObject {
  return {
    businessId: signals.businessId,
    commerce: { ...signals.commerce },
    funnel: { ...signals.funnel },
    campaign: { ...signals.campaign },
    customerSignals: signals.customerSignals.map((item) => ({ ...item })),
    contentSignals: signals.contentSignals.map((item) => ({ ...item })),
    products: signals.products.map((item) => ({ ...item })),
  };
}

function parseSignals(raw: JsonValue, businessId: string): GrowthSignalBundle {
  if (!isJsonRecord(raw)) throw new Error("Signals malformed.");
  return {
    businessId,
    commerce: normalizeCommerce(extractNested(raw, "commerce")),
    funnel: normalizeFunnel(extractNested(raw, "funnel")),
    campaign: normalizeCampaign(extractNested(raw, "campaign")),
    customerSignals: normalizeCustomerSignals(extractArray(raw, "customerSignals")),
    contentSignals: normalizeContentSignals(extractArray(raw, "contentSignals")),
    products: normalizeProducts(extractArray(raw, "products")),
  };
}

function parseEvidence(raw: JsonValue): EvidenceRecord[] {
  if (!Array.isArray(raw)) throw new Error("Evidence must be an array.");
  return raw.map((item) => {
    if (!isJsonRecord(item)) throw new Error("Evidence item malformed.");
    return {
      id: String(item["id"]),
      category: item["category"] as EvidenceRecord["category"],
      source: String(item["source"]),
      observation: String(item["observation"]),
    };
  });
}

function parseDiagnosis(raw: JsonValue): GrowthDiagnosis {
  if (!isJsonRecord(raw)) throw new Error("Diagnosis malformed.");
  return {
    constraint: raw["constraint"] as GrowthDiagnosis["constraint"],
    rationale: String(raw["rationale"]),
    evidenceIds: Array.isArray(raw["evidenceIds"]) ? raw["evidenceIds"].map(String) : [],
  };
}

function parseCustomerInsight(raw: JsonValue): CustomerInsightAnalysis {
  if (!isJsonRecord(raw)) throw new Error("Customer insight malformed.");
  return {
    topThemes: Array.isArray(raw["topThemes"]) ? raw["topThemes"].map(String) : [],
    checkoutFrictionScore: readNumber(raw["checkoutFrictionScore"]),
    supportingEvidenceIds: Array.isArray(raw["supportingEvidenceIds"]) ? raw["supportingEvidenceIds"].map(String) : [],
    summary: String(raw["summary"]),
  };
}

function parseResearch(raw: JsonValue): ResearchContext {
  if (!isJsonRecord(raw)) throw new Error("Research context malformed.");
  return {
    notes: Array.isArray(raw["notes"]) ? raw["notes"].map(String) : [],
    supportingEvidenceIds: Array.isArray(raw["supportingEvidenceIds"]) ? raw["supportingEvidenceIds"].map(String) : [],
  };
}

function parseOpportunities(raw: JsonValue): GrowthOpportunity[] {
  if (!Array.isArray(raw)) throw new Error("Opportunities must be an array.");
  return raw.map((item) => {
    if (!isJsonRecord(item)) throw new Error("Opportunity malformed.");
    return {
      id: String(item["id"]),
      constraint: item["constraint"] as GrowthOpportunity["constraint"],
      problem: String(item["problem"]),
      hypothesis: String(item["hypothesis"]),
      supportingEvidenceIds: Array.isArray(item["supportingEvidenceIds"])
        ? item["supportingEvidenceIds"].map(String)
        : [],
      expectedMetric: String(item["expectedMetric"]),
      interventionRoute: item["interventionRoute"] as InterventionRoute,
      basePriority: readNumber(item["basePriority"]),
    };
  });
}

function parseCritic(raw: JsonValue): CriticReview {
  if (!isJsonRecord(raw)) throw new Error("Critic review malformed.");
  const issuesRaw = raw["issues"];
  const adjustedRaw = raw["adjustedOpportunities"];
  return {
    issues: Array.isArray(issuesRaw)
      ? issuesRaw.map((item) => {
          if (!isJsonRecord(item)) throw new Error("Critic issue malformed.");
          return {
            code: String(item["code"]),
            severity: item["severity"] as CriticReview["issues"][number]["severity"],
            message: String(item["message"]),
            ...(item["opportunityId"] === undefined ? {} : { opportunityId: String(item["opportunityId"]) }),
          };
        })
      : [],
    adjustedOpportunities: Array.isArray(adjustedRaw)
      ? adjustedRaw.map((item) => {
          if (!isJsonRecord(item)) throw new Error("Adjusted opportunity malformed.");
          return {
            opportunityId: String(item["opportunityId"]),
            adjustedPriority: readNumber(item["adjustedPriority"]),
            downgraded: item["downgraded"] === true,
          };
        })
      : [],
  };
}

function parseSelected(raw: JsonValue): SelectedIntervention {
  if (!isJsonRecord(raw)) throw new Error("Selected intervention malformed.");
  return {
    opportunityId: String(raw["opportunityId"]),
    interventionRoute: raw["interventionRoute"] as InterventionRoute,
    rationale: String(raw["rationale"]),
  };
}

function parsePreparedAction(raw: JsonValue): PreparedAction {
  if (!isJsonRecord(raw)) throw new Error("Prepared action malformed.");
  return {
    actionType: raw["actionType"] as PreparedAction["actionType"],
    actionId: String(raw["actionId"]),
    title: String(raw["title"]),
    detail: String(raw["detail"]),
    monitoringMetric: String(raw["monitoringMetric"]),
    risk: raw["risk"] as PreparedAction["risk"],
  };
}

function parseApprovalSummary(raw: JsonValue): ApprovalSummary {
  if (!isJsonRecord(raw)) throw new Error("Approval summary malformed.");
  return {
    constraint: raw["constraint"] as ApprovalSummary["constraint"],
    evidenceHighlights: Array.isArray(raw["evidenceHighlights"]) ? raw["evidenceHighlights"].map(String) : [],
    selectedIntervention: String(raw["selectedIntervention"]),
    expectedMetric: String(raw["expectedMetric"]),
    riskReview: String(raw["riskReview"]),
    proposedAction: String(raw["proposedAction"]),
  };
}

function parseApprovalDecision(raw: JsonValue): ApprovalDecisionRecord {
  if (!isJsonRecord(raw)) throw new Error("Approval decision malformed.");
  const decision = raw["decision"];
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    throw new Error("Approval decision invalid.");
  }
  return {
    decision,
    ...(raw["comment"] === undefined ? {} : { comment: String(raw["comment"]) }),
  };
}

function parseActionResult(raw: JsonValue): ActionExecutionResult {
  if (!isJsonRecord(raw)) throw new Error("Action result malformed.");
  return {
    actionId: String(raw["actionId"]),
    status: raw["status"] as ActionExecutionResult["status"],
    details: String(raw["details"]),
    monitoringMetric: String(raw["monitoringMetric"]),
  };
}

function parseExecutionVerification(raw: JsonValue): ExecutionVerification {
  if (!isJsonRecord(raw)) throw new Error("Execution verification malformed.");
  return {
    actionRecorded: raw["actionRecorded"] === true,
    monitoringMetricAttached: raw["monitoringMetricAttached"] === true,
    duplicatePrevented: raw["duplicatePrevented"] === true,
    notes: Array.isArray(raw["notes"]) ? raw["notes"].map(String) : [],
  };
}
