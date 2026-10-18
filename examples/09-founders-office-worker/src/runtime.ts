import type { JsonObject, JsonValue, ToolVersionId } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";
import { isJsonRecord } from "@osva-examples/utils";

import { buildApprovalSummary, prepareRecommendedActions } from "./actions.js";
import { buildCompanyDataBundle } from "./fixtures.js";
import { buildFoundersOfficeRequest, validateFoundersOfficeInput } from "./input.js";
import { detectRisksAndOpportunities, prioritizeAttentionItems } from "./priorities.js";
import { renderExecutiveBriefMarkdown } from "./report.js";
import { assertSignalTraceability, normalizeCompanySignals } from "./signals.js";
import type {
  ApprovalSummary,
  AttentionPrioritization,
  CompanyDataBundle,
  DetectionResult,
  FoundersOfficeRequest,
  NormalizedSignal,
  RecommendedAction,
} from "./types.js";

export const COMPANY_KPIS_TOOL_BINDING = "company_kpis_tool";
export const COMPANY_PROJECTS_TOOL_BINDING = "company_projects_tool";
export const COMPANY_SALES_TOOL_BINDING = "company_sales_tool";
export const COMPANY_CUSTOMER_TOOL_BINDING = "company_customer_tool";
export const COMPANY_OPS_TOOL_BINDING = "company_ops_tool";

interface ParsedFoundersEnvelope {
  readonly request: FoundersOfficeRequest;
  readonly data?: CompanyDataBundle;
  readonly signals?: readonly NormalizedSignal[];
  readonly detection?: DetectionResult;
  readonly prioritization?: AttentionPrioritization;
  readonly actions?: readonly RecommendedAction[];
  readonly approvalSummary?: ApprovalSummary;
}

interface RuntimeToolContext {
  readonly tools: {
    invoke(input: { binding: string; input: JsonObject; idempotencyKey: string }): Promise<JsonValue>;
  };
}

export const foundersOfficeRuntime = createRuntime({
  execute: async (input, context) => {
    const envelope = parseEnvelope(input);

    if (envelope.data === undefined) {
      const data = await collectCompanyDataViaTools(envelope.request.companyId, context);
      return toWorkflowJson({ ...envelope, data });
    }

    if (envelope.signals === undefined) {
      const signals = normalizeCompanySignals(envelope.data);
      assertSignalTraceability(signals);
      return toWorkflowJson({ ...envelope, signals });
    }

    if (envelope.detection === undefined) {
      const detection = detectRisksAndOpportunities(envelope.signals);
      return toWorkflowJson({ ...envelope, detection });
    }

    if (envelope.prioritization === undefined) {
      const prioritization = prioritizeAttentionItems(envelope.detection, envelope.signals, envelope.request);
      return toWorkflowJson({ ...envelope, prioritization });
    }

    if (envelope.actions === undefined) {
      const actions = prepareRecommendedActions(envelope.prioritization);
      const approvalSummary = buildApprovalSummary({ prioritization: envelope.prioritization, actions });
      return toWorkflowJson({ ...envelope, actions, approvalSummary });
    }

    const approvalSummary =
      envelope.approvalSummary ??
      buildApprovalSummary({ prioritization: envelope.prioritization, actions: envelope.actions });

    const markdown = renderExecutiveBriefMarkdown({
      request: envelope.request,
      data: envelope.data,
      signals: envelope.signals,
      prioritization: envelope.prioritization,
      actions: envelope.actions,
      approvalSummary,
    });
    const artifact = await context.artifacts.create({
      name: `founders-brief-${envelope.request.briefId}.md`,
      mediaType: "text/markdown",
      content: new Blob([markdown], { type: "text/markdown" }),
      metadata: { example: "09-founders-office-worker", companyId: envelope.request.companyId },
      idempotencyKey: `founders-brief-${envelope.request.briefId}`,
    });
    return toWorkflowJson({
      ...envelope,
      approvalSummary,
      report: {
        artifact: artifact.reference,
        name: artifact.name,
        mediaType: artifact.mediaType,
        attentionItemCount: envelope.prioritization.items.length,
        actionCount: envelope.actions.length,
      },
    });
  },
});

async function collectCompanyDataViaTools(companyId: string, context: RuntimeToolContext): Promise<CompanyDataBundle> {
  const toolInput = { companyId };
  const prefix = `company-${companyId}`;

  const [kpisResult, projectsResult, salesResult, customerResult, opsResult] = await Promise.all([
    context.tools.invoke({ binding: COMPANY_KPIS_TOOL_BINDING, input: toolInput, idempotencyKey: `${prefix}-kpis` }),
    context.tools.invoke({
      binding: COMPANY_PROJECTS_TOOL_BINDING,
      input: toolInput,
      idempotencyKey: `${prefix}-projects`,
    }),
    context.tools.invoke({ binding: COMPANY_SALES_TOOL_BINDING, input: toolInput, idempotencyKey: `${prefix}-sales` }),
    context.tools.invoke({
      binding: COMPANY_CUSTOMER_TOOL_BINDING,
      input: toolInput,
      idempotencyKey: `${prefix}-customer`,
    }),
    context.tools.invoke({ binding: COMPANY_OPS_TOOL_BINDING, input: toolInput, idempotencyKey: `${prefix}-ops` }),
  ]);

  const expected = buildCompanyDataBundle(companyId);
  const kpis = extractNestedRecord(kpisResult, "kpis");
  const projects = extractArray(projectsResult, "projects");
  const sales = extractNestedRecord(salesResult, "sales");
  const customer = extractNestedRecord(customerResult, "customer");
  const operations = extractArray(opsResult, "operations");

  return {
    companyId,
    kpis: normalizeKpis(kpis, expected.kpis),
    projects: normalizeProjects(projects),
    sales: normalizeSales(sales),
    customer: normalizeCustomer(customer),
    operations: normalizeOperations(operations),
  };
}

function extractNestedRecord(raw: JsonValue, field: string): JsonObject {
  if (!isJsonRecord(raw)) throw new Error(`Tool result must be an object for ${field}.`);
  const nested = raw[field];
  if (nested === undefined || !isJsonRecord(nested)) throw new Error(`Tool result is missing ${field}.`);
  return nested;
}

function extractArray(raw: JsonValue, field: string): JsonValue[] {
  if (!isJsonRecord(raw)) throw new Error(`Tool result must be an object for ${field}.`);
  const nested = raw[field];
  if (!Array.isArray(nested)) throw new Error(`Tool result is missing ${field} array.`);
  return nested;
}

function normalizeKpis(raw: JsonObject, expected: CompanyDataBundle["kpis"]): CompanyDataBundle["kpis"] {
  void expected;
  return {
    mrr: readNumber(raw["mrr"], "kpis.mrr"),
    mrrGrowthRate: readNumber(raw["mrrGrowthRate"], "kpis.mrrGrowthRate"),
    priorMrrGrowthRate: readNumber(raw["priorMrrGrowthRate"], "kpis.priorMrrGrowthRate"),
    trialConversionRate: readNumber(raw["trialConversionRate"], "kpis.trialConversionRate"),
    grossRetentionRate: readNumber(raw["grossRetentionRate"], "kpis.grossRetentionRate"),
    logoChurnRate: readNumber(raw["logoChurnRate"], "kpis.logoChurnRate"),
    priorLogoChurnRate: readNumber(raw["priorLogoChurnRate"], "kpis.priorLogoChurnRate"),
    monthlyBurn: readNumber(raw["monthlyBurn"], "kpis.monthlyBurn"),
    priorMonthlyBurn: readNumber(raw["priorMonthlyBurn"], "kpis.priorMonthlyBurn"),
    grossMarginRate: readNumber(raw["grossMarginRate"], "kpis.grossMarginRate"),
    paidChannelRoas: readNumber(raw["paidChannelRoas"], "kpis.paidChannelRoas"),
    paidSpendCap: readNumber(raw["paidSpendCap"], "kpis.paidSpendCap"),
  };
}

function normalizeProjects(raw: JsonValue[]): CompanyDataBundle["projects"] {
  return raw.map((item, index) => {
    if (!isJsonRecord(item)) throw new Error(`projects[${index}] must be an object.`);
    const blockers = item["blockers"];
    if (!Array.isArray(blockers)) throw new Error(`projects[${index}].blockers must be an array.`);
    const status = item["status"];
    if (status !== "on-track" && status !== "at-risk" && status !== "overdue" && status !== "ahead") {
      throw new Error(`projects[${index}].status is invalid.`);
    }
    const businessImpact = item["businessImpact"];
    if (businessImpact !== "high" && businessImpact !== "medium" && businessImpact !== "low") {
      throw new Error(`projects[${index}].businessImpact is invalid.`);
    }
    const confidence = item["confidence"];
    if (confidence !== "high" && confidence !== "medium" && confidence !== "low") {
      throw new Error(`projects[${index}].confidence is invalid.`);
    }
    return {
      id: readString(item["id"], `projects[${index}].id`),
      name: readString(item["name"], `projects[${index}].name`),
      owner: readString(item["owner"], `projects[${index}].owner`),
      dueDate: readString(item["dueDate"], `projects[${index}].dueDate`),
      status,
      businessImpact,
      blockers: blockers.map(String),
      confidence,
    };
  });
}

function normalizeSales(raw: JsonObject): CompanyDataBundle["sales"] {
  const stalledRaw = raw["stalledDeals"];
  if (!Array.isArray(stalledRaw)) throw new Error("sales.stalledDeals must be an array.");
  return {
    totalPipelineValue: readNumber(raw["totalPipelineValue"], "sales.totalPipelineValue"),
    winRate: readNumber(raw["winRate"], "sales.winRate"),
    enterprisePipelineGrowth: readNumber(raw["enterprisePipelineGrowth"], "sales.enterprisePipelineGrowth"),
    stalledDeals: stalledRaw.map((item, index) => {
      if (!isJsonRecord(item)) throw new Error(`stalledDeals[${index}] must be an object.`);
      return {
        id: readString(item["id"], `stalledDeals[${index}].id`),
        account: readString(item["account"], `stalledDeals[${index}].account`),
        value: readNumber(item["value"], `stalledDeals[${index}].value`),
        daysStalled: readNumber(item["daysStalled"], `stalledDeals[${index}].daysStalled`),
      };
    }),
  };
}

function normalizeCustomer(raw: JsonObject): CompanyDataBundle["customer"] {
  const reasons = raw["topChurnReasons"];
  const requests = raw["notableRequests"];
  if (!Array.isArray(reasons) || !Array.isArray(requests)) {
    throw new Error("customer arrays are malformed.");
  }
  return {
    supportTicketTrendPct: readNumber(raw["supportTicketTrendPct"], "customer.supportTicketTrendPct"),
    nps: readNumber(raw["nps"], "customer.nps"),
    priorNps: readNumber(raw["priorNps"], "customer.priorNps"),
    topChurnReasons: reasons.map(String),
    notableRequests: requests.map((item, index) => {
      if (!isJsonRecord(item)) throw new Error(`notableRequests[${index}] malformed.`);
      return {
        id: readString(item["id"], `notableRequests[${index}].id`),
        text: readString(item["text"], `notableRequests[${index}].text`),
        mentionCount: readNumber(item["mentionCount"], `notableRequests[${index}].mentionCount`),
      };
    }),
  };
}

function normalizeOperations(raw: JsonValue[]): CompanyDataBundle["operations"] {
  return raw.map((item, index) => {
    if (!isJsonRecord(item)) throw new Error(`operations[${index}] must be an object.`);
    const severity = item["severity"];
    const status = item["status"];
    if (
      (severity !== "critical" && severity !== "high" && severity !== "medium" && severity !== "low") ||
      (status !== "open" && status !== "monitoring" && status !== "resolved")
    ) {
      throw new Error(`operations[${index}] enum invalid.`);
    }
    return {
      id: readString(item["id"], `operations[${index}].id`),
      area: readString(item["area"], `operations[${index}].area`),
      severity,
      description: readString(item["description"], `operations[${index}].description`),
      status,
    };
  });
}

function readNumber(value: JsonValue | undefined, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be a finite number.`);
  return value;
}

function readString(value: JsonValue | undefined, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be a non-empty string.`);
  return value;
}

export function buildFoundersOfficeAgentManifest(
  runtimeUrl: string,
  toolVersionIds: {
    readonly kpis: ToolVersionId;
    readonly projects: ToolVersionId;
    readonly sales: ToolVersionId;
    readonly customer: ToolVersionId;
    readonly operations: ToolVersionId;
  },
) {
  return {
    schemaVersion: "1" as const,
    key: "founders-office-agent",
    name: "Founder's Office Agent",
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
              companyId: { type: "string" },
              objective: { type: "string" },
              context: { type: "string" },
            },
            required: ["briefId", "companyId"],
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
        COMPANY_KPIS_TOOL_BINDING,
        COMPANY_PROJECTS_TOOL_BINDING,
        COMPANY_SALES_TOOL_BINDING,
        COMPANY_CUSTOMER_TOOL_BINDING,
        COMPANY_OPS_TOOL_BINDING,
      ],
    },
    tools: {
      [COMPANY_KPIS_TOOL_BINDING]: { toolVersionId: toolVersionIds.kpis },
      [COMPANY_PROJECTS_TOOL_BINDING]: { toolVersionId: toolVersionIds.projects },
      [COMPANY_SALES_TOOL_BINDING]: { toolVersionId: toolVersionIds.sales },
      [COMPANY_CUSTOMER_TOOL_BINDING]: { toolVersionId: toolVersionIds.customer },
      [COMPANY_OPS_TOOL_BINDING]: { toolVersionId: toolVersionIds.operations },
    },
  };
}

export function parseEnvelope(input: JsonValue): ParsedFoundersEnvelope {
  if (!isJsonRecord(input)) throw new Error("Workflow input must be an object.");
  const requestRaw = input["request"];
  if (requestRaw === undefined || !isJsonRecord(requestRaw)) throw new Error("Workflow envelope is missing request.");
  if (typeof requestRaw["briefId"] !== "string") throw new Error("Workflow request must include briefId.");
  const validated = validateFoundersOfficeInput({
    companyId: requestRaw["companyId"],
    objective: requestRaw["objective"],
    context: requestRaw["context"],
  });
  const request = buildFoundersOfficeRequest(validated, requestRaw["briefId"]);
  const envelope: ParsedFoundersEnvelope = { request };

  if (input["data"] === undefined) return envelope;
  const data = parseCompanyData(input["data"], request.companyId);

  if (input["signals"] === undefined) return { ...envelope, data };
  const signals = parseSignals(input["signals"]);

  if (input["detection"] === undefined) return { ...envelope, data, signals };
  const detection = parseDetection(input["detection"]);

  if (input["prioritization"] === undefined) return { ...envelope, data, signals, detection };
  const prioritization = parsePrioritization(input["prioritization"]);

  if (input["actions"] === undefined) return { ...envelope, data, signals, detection, prioritization };
  const actions = parseActions(input["actions"]);

  const approvalSummaryRaw = input["approvalSummary"];
  const approvalSummary = approvalSummaryRaw === undefined ? undefined : parseApprovalSummary(approvalSummaryRaw);

  return { ...envelope, data, signals, detection, prioritization, actions, approvalSummary };
}

function toWorkflowJson(envelope: ParsedFoundersEnvelope & { readonly report?: JsonObject }): JsonObject {
  const request: JsonObject = {
    briefId: envelope.request.briefId,
    companyId: envelope.request.companyId,
    ...(envelope.request.objective === undefined ? {} : { objective: envelope.request.objective }),
    ...(envelope.request.context === undefined ? {} : { context: envelope.request.context }),
  };
  return {
    request,
    ...(envelope.data === undefined ? {} : { data: dataToJson(envelope.data) }),
    ...(envelope.signals === undefined ? {} : { signals: envelope.signals.map(signalToJson) }),
    ...(envelope.detection === undefined ? {} : { detection: detectionToJson(envelope.detection) }),
    ...(envelope.prioritization === undefined ? {} : { prioritization: prioritizationToJson(envelope.prioritization) }),
    ...(envelope.actions === undefined ? {} : { actions: envelope.actions.map(actionToJson) }),
    ...(envelope.approvalSummary === undefined
      ? {}
      : { approvalSummary: approvalSummaryToJson(envelope.approvalSummary) }),
    ...(envelope.report === undefined ? {} : { report: envelope.report }),
  };
}

function dataToJson(data: CompanyDataBundle): JsonObject {
  return {
    companyId: data.companyId,
    kpis: { ...data.kpis },
    projects: data.projects.map((project) => ({ ...project, blockers: [...project.blockers] })),
    sales: { ...data.sales, stalledDeals: data.sales.stalledDeals.map((deal) => ({ ...deal })) },
    customer: {
      ...data.customer,
      topChurnReasons: [...data.customer.topChurnReasons],
      notableRequests: data.customer.notableRequests.map((item) => ({ ...item })),
    },
    operations: data.operations.map((item) => ({ ...item })),
  };
}

function signalToJson(signal: NormalizedSignal): JsonObject {
  return { ...signal, evidence: [...signal.evidence] };
}

function detectionToJson(detection: DetectionResult): JsonObject {
  return {
    risks: detection.risks.map(attentionToJson),
    opportunities: detection.opportunities.map(attentionToJson),
    decisions: detection.decisions.map(attentionToJson),
  };
}

function attentionToJson(item: DetectionResult["risks"][number]): JsonObject {
  return { ...item, sourceSignalIds: [...item.sourceSignalIds] };
}

function prioritizationToJson(prioritization: AttentionPrioritization): JsonObject {
  return {
    method: prioritization.method,
    items: prioritization.items.map((item) => ({ ...item, sourceSignalIds: [...item.sourceSignalIds] })),
  };
}

function actionToJson(action: RecommendedAction): JsonObject {
  return { ...action };
}

function approvalSummaryToJson(summary: ApprovalSummary): JsonObject {
  return {
    topRisks: [...summary.topRisks],
    topOpportunities: [...summary.topOpportunities],
    criticalDecisions: [...summary.criticalDecisions],
    recommendedActions: [...summary.recommendedActions],
  };
}

function parseCompanyData(raw: JsonValue, companyId: string): CompanyDataBundle {
  if (!isJsonRecord(raw)) throw new Error("Company data must be an object.");
  const kpis = readRequiredRecord(raw["kpis"], "data.kpis");
  const projects = raw["projects"];
  const sales = readRequiredRecord(raw["sales"], "data.sales");
  const customer = readRequiredRecord(raw["customer"], "data.customer");
  const operations = raw["operations"];
  if (!Array.isArray(projects) || !Array.isArray(operations))
    throw new Error("data projects/operations must be arrays.");
  return {
    companyId,
    kpis: normalizeKpis(kpis, buildCompanyDataBundle(companyId).kpis),
    projects: normalizeProjects(projects),
    sales: normalizeSales(sales),
    customer: normalizeCustomer(customer),
    operations: normalizeOperations(operations),
  };
}

function readRequiredRecord(value: JsonValue | undefined, field: string): JsonObject {
  if (value === undefined || !isJsonRecord(value)) throw new Error(`${field} must be an object.`);
  return value;
}

function parseSignals(raw: JsonValue): NormalizedSignal[] {
  if (!Array.isArray(raw)) throw new Error("Signals must be an array.");
  return raw.map(parseSignal);
}

function parseSignal(raw: JsonValue): NormalizedSignal {
  if (!isJsonRecord(raw)) throw new Error("Signal must be an object.");
  const category = raw["category"];
  const urgency = raw["urgency"];
  const impact = raw["impact"];
  if (
    typeof raw["id"] !== "string" ||
    typeof raw["title"] !== "string" ||
    typeof raw["description"] !== "string" ||
    typeof raw["sourceRef"] !== "string" ||
    !Array.isArray(raw["evidence"]) ||
    (category !== "growth" &&
      category !== "revenue" &&
      category !== "customer" &&
      category !== "operations" &&
      category !== "product" &&
      category !== "people" &&
      category !== "finance") ||
    (urgency !== "high" && urgency !== "medium" && urgency !== "low") ||
    (impact !== "high" && impact !== "medium" && impact !== "low")
  ) {
    throw new Error("Signal is malformed.");
  }
  return {
    id: raw["id"],
    category,
    title: raw["title"],
    description: raw["description"],
    evidence: raw["evidence"].map(String),
    urgency,
    impact,
    sourceRef: raw["sourceRef"],
  };
}

function parseDetection(raw: JsonValue): DetectionResult {
  if (!isJsonRecord(raw)) throw new Error("Detection must be an object.");
  return {
    risks: parseAttentionArray(raw["risks"]),
    opportunities: parseAttentionArray(raw["opportunities"]),
    decisions: parseAttentionArray(raw["decisions"]),
  };
}

function parseAttentionArray(raw: JsonValue | undefined): DetectionResult["risks"] {
  if (!Array.isArray(raw)) throw new Error("Detection list must be an array.");
  return raw.map(parseAttentionItem);
}

function parseAttentionItem(raw: JsonValue): DetectionResult["risks"][number] {
  if (!isJsonRecord(raw)) throw new Error("Attention item must be an object.");
  const type = raw["type"];
  const priority = raw["priority"];
  if (
    typeof raw["id"] !== "string" ||
    typeof raw["title"] !== "string" ||
    typeof raw["rationale"] !== "string" ||
    !Array.isArray(raw["sourceSignalIds"]) ||
    typeof raw["priorityScore"] !== "number" ||
    (type !== "risk" && type !== "opportunity" && type !== "decision") ||
    (priority !== "critical" && priority !== "high" && priority !== "medium" && priority !== "low")
  ) {
    throw new Error("Attention item is malformed.");
  }
  return {
    id: raw["id"],
    type,
    title: raw["title"],
    rationale: raw["rationale"],
    sourceSignalIds: raw["sourceSignalIds"].map(String),
    priority,
    priorityScore: raw["priorityScore"],
  };
}

function parsePrioritization(raw: JsonValue): AttentionPrioritization {
  if (!isJsonRecord(raw)) throw new Error("Prioritization must be an object.");
  const method = raw["method"];
  const items = raw["items"];
  if (typeof method !== "string" || !Array.isArray(items)) throw new Error("Prioritization is malformed.");
  return { method, items: items.map(parseAttentionItem) };
}

function parseActions(raw: JsonValue): RecommendedAction[] {
  if (!Array.isArray(raw)) throw new Error("Actions must be an array.");
  return raw.map((item) => {
    if (!isJsonRecord(item)) throw new Error("Action must be an object.");
    const dueWindow = item["dueWindow"];
    if (dueWindow !== "today" && dueWindow !== "this-week" && dueWindow !== "this-month") {
      throw new Error("Action dueWindow is invalid.");
    }
    if (
      typeof item["id"] !== "string" ||
      typeof item["relatedPriorityId"] !== "string" ||
      typeof item["action"] !== "string" ||
      typeof item["ownerRole"] !== "string" ||
      typeof item["requiresApproval"] !== "boolean"
    ) {
      throw new Error("Action is malformed.");
    }
    return {
      id: item["id"],
      relatedPriorityId: item["relatedPriorityId"],
      action: item["action"],
      ownerRole: item["ownerRole"],
      dueWindow,
      requiresApproval: item["requiresApproval"],
    };
  });
}

function parseApprovalSummary(raw: JsonValue): ApprovalSummary {
  if (!isJsonRecord(raw)) throw new Error("Approval summary must be an object.");
  if (
    !Array.isArray(raw["topRisks"]) ||
    !Array.isArray(raw["topOpportunities"]) ||
    !Array.isArray(raw["criticalDecisions"]) ||
    !Array.isArray(raw["recommendedActions"])
  ) {
    throw new Error("Approval summary is malformed.");
  }
  return {
    topRisks: raw["topRisks"].map(String),
    topOpportunities: raw["topOpportunities"].map(String),
    criticalDecisions: raw["criticalDecisions"].map(String),
    recommendedActions: raw["recommendedActions"].map(String),
  };
}
