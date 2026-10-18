import type { JsonObject, JsonValue, ToolVersionId } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";
import { isJsonRecord } from "@osva-examples/utils";

import { buildActionIdempotencyKey } from "./actions.js";
import { classifySupportIntent } from "./classifier.js";
import { evaluateSupportPolicy, planWorkflowRoute } from "./policy.js";
import { createEscalation, generateCustomerResponse } from "./response.js";
import { buildSupportWorkerRequest, validateSupportWorkerInput } from "./input.js";
import type {
  ActionExecutionResult,
  ApprovalDecisionRecord,
  Customer,
  EscalationRecord,
  Order,
  PolicyDecision,
  Shipment,
  SupportIntent,
  SupportWorkerRequest,
  WorkflowRoute,
} from "./types.js";

export const GET_CUSTOMER_TOOL_BINDING = "support_get_customer_tool";
export const GET_ORDER_TOOL_BINDING = "support_get_order_tool";
export const GET_SHIPMENT_TOOL_BINDING = "support_get_shipment_tool";
export const ISSUE_REFUND_TOOL_BINDING = "support_issue_refund_tool";
export const CANCEL_ORDER_TOOL_BINDING = "support_cancel_order_tool";

interface ParsedSupportEnvelope {
  readonly request: SupportWorkerRequest;
  readonly intent?: SupportIntent;
  readonly customer?: Customer;
  readonly order?: Order;
  readonly shipment?: Shipment;
  readonly contextLoaded?: boolean;
  readonly policyDecision?: PolicyDecision;
  readonly route?: WorkflowRoute;
  readonly approvalDecision?: ApprovalDecisionRecord;
  readonly actionResult?: ActionExecutionResult;
  readonly escalation?: EscalationRecord;
  readonly response?: string;
}

export const customerSupportRuntime = createRuntime({
  execute: async (input, context) => {
    const envelope = parseEnvelope(input);

    if (envelope.intent === undefined) {
      const intent = classifySupportIntent(envelope.request.message);
      return toWorkflowJson({ ...envelope, intent });
    }

    if (envelope.contextLoaded !== true) {
      const loaded = await loadSupportContext(envelope.request, envelope.intent, context);
      return toWorkflowJson({ ...envelope, ...loaded, contextLoaded: true });
    }

    if (envelope.policyDecision === undefined) {
      const policyDecision = evaluateSupportPolicy({
        intent: envelope.intent,
        customer: envelope.customer,
        order: envelope.order,
        shipment: envelope.shipment,
        message: envelope.request.message,
      });
      return toWorkflowJson({ ...envelope, policyDecision });
    }

    if (envelope.route === undefined) {
      const route = planWorkflowRoute(envelope.policyDecision);
      return toWorkflowJson({ ...envelope, route });
    }

    if (envelope.route === "escalate" && envelope.escalation === undefined) {
      const escalation = createEscalation({
        ticketId: envelope.request.ticketId,
        reason: envelope.policyDecision.reason,
        customer: envelope.customer,
        order: envelope.order,
        message: envelope.request.message,
      });
      return toWorkflowJson({ ...envelope, escalation });
    }

    const shouldExecuteAction =
      (envelope.route === "auto-action" || envelope.route === "needs-approval") && envelope.actionResult === undefined;

    if (shouldExecuteAction) {
      if (envelope.order === undefined) {
        throw new Error("Action execution requires order context from lookup stage.");
      }
      const actionResult = await executePolicyAction(
        {
          ...envelope,
          intent: envelope.intent,
          policyDecision: envelope.policyDecision,
          route: envelope.route,
          order: envelope.order,
        },
        context,
      );
      return toWorkflowJson({ ...envelope, actionResult });
    }

    if (envelope.response === undefined) {
      const response = generateCustomerResponse({
        request: envelope.request,
        intent: envelope.intent,
        customer: envelope.customer,
        order: envelope.order,
        shipment: envelope.shipment,
        policyDecision: envelope.policyDecision,
        approvalDecision: envelope.approvalDecision,
        actionResult: envelope.actionResult,
        escalation: envelope.escalation,
      });
      return toWorkflowJson({ ...envelope, response });
    }

    return toWorkflowJson(envelope);
  },
});

async function loadSupportContext(
  request: SupportWorkerRequest,
  intent: SupportIntent,
  context: Parameters<NonNullable<Parameters<typeof createRuntime>[0]["execute"]>>[1],
): Promise<Pick<ParsedSupportEnvelope, "customer" | "order" | "shipment">> {
  const customerResult = await context.tools.invoke({
    binding: GET_CUSTOMER_TOOL_BINDING,
    input: { customerId: request.customerId },
    idempotencyKey: `customer-${request.ticketId}`,
  });
  const customer = extractCustomerFromToolResult(customerResult);

  const orderResult = await context.tools.invoke({
    binding: GET_ORDER_TOOL_BINDING,
    input: { orderId: customer.primaryOrderId },
    idempotencyKey: `order-${request.ticketId}`,
  });
  const order = extractOrderFromToolResult(orderResult);

  let shipment: Shipment | undefined;
  const needsShipment =
    intent === "order-status" ||
    intent === "shipment-delay" ||
    intent === "refund-request" ||
    intent === "cancel-order";
  if (needsShipment && order.shipmentId !== undefined) {
    const shipmentResult = await context.tools.invoke({
      binding: GET_SHIPMENT_TOOL_BINDING,
      input: { shipmentId: order.shipmentId },
      idempotencyKey: `shipment-${request.ticketId}`,
    });
    shipment = extractShipmentFromToolResult(shipmentResult);
  }

  return { customer, order, shipment };
}

async function executePolicyAction(
  envelope: ParsedSupportEnvelope & {
    readonly intent: SupportIntent;
    readonly policyDecision: PolicyDecision;
    readonly route: WorkflowRoute;
    readonly order: Order;
  },
  context: Parameters<NonNullable<Parameters<typeof createRuntime>[0]["execute"]>>[1],
): Promise<ActionExecutionResult> {
  const actionId = buildActionIdempotencyKey(envelope.request.ticketId, envelope.policyDecision);

  if (envelope.route === "needs-approval") {
    // When OSVA merges approval output into the envelope, honor rejections. If absent, the
    // workflow reached post-approval action execution and proceeds (see README).
    const decision = envelope.approvalDecision?.decision ?? "APPROVED";
    if (decision === "REJECTED") {
      return {
        actionId,
        status: "rejected",
        message: "Human reviewer rejected the sensitive support action.",
      };
    }
  }

  if (envelope.policyDecision.action === "refund") {
    const amount = envelope.policyDecision.amount ?? envelope.order.totalAmount;
    const toolResult = await context.tools.invoke({
      binding: ISSUE_REFUND_TOOL_BINDING,
      input: { orderId: envelope.order.id, amount, actionId },
      idempotencyKey: actionId,
    });
    return extractActionResultFromToolResult(toolResult);
  }

  if (envelope.policyDecision.action === "cancel") {
    const toolResult = await context.tools.invoke({
      binding: CANCEL_ORDER_TOOL_BINDING,
      input: { orderId: envelope.order.id, actionId },
      idempotencyKey: actionId,
    });
    return extractActionResultFromToolResult(toolResult);
  }

  return {
    actionId,
    status: "rejected",
    message: "No executable demo action matched the policy decision.",
  };
}

export function buildCustomerSupportAgentManifest(
  runtimeUrl: string,
  toolVersionIds: {
    readonly getCustomer: ToolVersionId;
    readonly getOrder: ToolVersionId;
    readonly getShipment: ToolVersionId;
    readonly issueRefund: ToolVersionId;
    readonly cancelOrder: ToolVersionId;
  },
) {
  return {
    schemaVersion: "1" as const,
    key: "customer-support-agent",
    name: "Customer Support Agent",
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
              ticketId: { type: "string" },
              customerId: { type: "string" },
              message: { type: "string" },
            },
            required: ["ticketId", "customerId", "message"],
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
        GET_CUSTOMER_TOOL_BINDING,
        GET_ORDER_TOOL_BINDING,
        GET_SHIPMENT_TOOL_BINDING,
        ISSUE_REFUND_TOOL_BINDING,
        CANCEL_ORDER_TOOL_BINDING,
      ],
    },
    tools: {
      [GET_CUSTOMER_TOOL_BINDING]: { toolVersionId: toolVersionIds.getCustomer },
      [GET_ORDER_TOOL_BINDING]: { toolVersionId: toolVersionIds.getOrder },
      [GET_SHIPMENT_TOOL_BINDING]: { toolVersionId: toolVersionIds.getShipment },
      [ISSUE_REFUND_TOOL_BINDING]: { toolVersionId: toolVersionIds.issueRefund },
      [CANCEL_ORDER_TOOL_BINDING]: { toolVersionId: toolVersionIds.cancelOrder },
    },
  };
}

export function parseEnvelope(input: JsonValue): ParsedSupportEnvelope {
  if (!isJsonRecord(input)) {
    throw new Error("Workflow input must be an object.");
  }
  const requestRaw = input["request"];
  if (requestRaw === undefined || !isJsonRecord(requestRaw)) {
    throw new Error("Workflow envelope is missing request.");
  }
  if (typeof requestRaw["ticketId"] !== "string") {
    throw new Error("Workflow request must include ticketId.");
  }
  const validated = validateSupportWorkerInput({
    customerId: requestRaw["customerId"],
    message: requestRaw["message"],
  });
  const request = buildSupportWorkerRequest(validated, requestRaw["ticketId"]);

  const envelope: ParsedSupportEnvelope = { request };

  const intentRaw = input["intent"];
  if (intentRaw === undefined) {
    return envelope;
  }
  const intent = parseIntent(intentRaw);

  if (input["contextLoaded"] !== true) {
    return { ...envelope, intent };
  }

  const customer = parseOptionalCustomer(input["customer"]);
  const order = parseOptionalOrder(input["order"]);
  const shipment = parseOptionalShipment(input["shipment"]);

  const policyRaw = input["policyDecision"];
  if (policyRaw === undefined) {
    return { ...envelope, intent, customer, order, shipment, contextLoaded: true };
  }
  const policyDecision = parsePolicyDecision(policyRaw);

  const routeRaw = input["route"];
  if (routeRaw === undefined) {
    return { ...envelope, intent, customer, order, shipment, contextLoaded: true, policyDecision };
  }
  const route = parseRoute(routeRaw);

  const approvalDecision = parseOptionalApprovalDecision(input["approvalDecision"]);
  const escalation = parseOptionalEscalation(input["escalation"]);
  const actionResult = parseOptionalActionResult(input["actionResult"]);
  const response = typeof input["response"] === "string" ? input["response"] : undefined;

  return {
    ...envelope,
    intent,
    customer,
    order,
    shipment,
    contextLoaded: true,
    policyDecision,
    route,
    approvalDecision,
    escalation,
    actionResult,
    response,
  };
}

function toWorkflowJson(envelope: ParsedSupportEnvelope): JsonObject {
  const request: JsonObject = {
    ticketId: envelope.request.ticketId,
    customerId: envelope.request.customerId,
    message: envelope.request.message,
  };

  return {
    request,
    ...(envelope.intent === undefined ? {} : { intent: envelope.intent }),
    ...(envelope.contextLoaded === true ? { contextLoaded: true } : {}),
    ...(envelope.customer === undefined ? {} : { customer: customerToJson(envelope.customer) }),
    ...(envelope.order === undefined ? {} : { order: orderToJson(envelope.order) }),
    ...(envelope.shipment === undefined ? {} : { shipment: shipmentToJson(envelope.shipment) }),
    ...(envelope.policyDecision === undefined ? {} : { policyDecision: policyDecisionToJson(envelope.policyDecision) }),
    ...(envelope.route === undefined ? {} : { route: envelope.route }),
    ...(envelope.approvalDecision === undefined
      ? {}
      : { approvalDecision: approvalDecisionToJson(envelope.approvalDecision) }),
    ...(envelope.actionResult === undefined ? {} : { actionResult: actionResultToJson(envelope.actionResult) }),
    ...(envelope.escalation === undefined ? {} : { escalation: escalationToJson(envelope.escalation) }),
    ...(envelope.response === undefined ? {} : { response: envelope.response }),
  };
}

function customerToJson(customer: Customer): JsonObject {
  return {
    id: customer.id,
    name: customer.name,
    primaryOrderId: customer.primaryOrderId,
    ...(customer.tier === undefined ? {} : { tier: customer.tier }),
  };
}

function orderToJson(order: Order): JsonObject {
  return {
    id: order.id,
    customerId: order.customerId,
    status: order.status,
    totalAmount: order.totalAmount,
    currency: order.currency,
    placedAt: order.placedAt,
    ...(order.deliveredAt === undefined ? {} : { deliveredAt: order.deliveredAt }),
    ...(order.shipmentId === undefined ? {} : { shipmentId: order.shipmentId }),
  };
}

function shipmentToJson(shipment: Shipment): JsonObject {
  return {
    id: shipment.id,
    status: shipment.status,
    ...(shipment.expectedDeliveryDate === undefined ? {} : { expectedDeliveryDate: shipment.expectedDeliveryDate }),
  };
}

function policyDecisionToJson(decision: PolicyDecision): JsonObject {
  return {
    eligible: decision.eligible,
    action: decision.action,
    requiresApproval: decision.requiresApproval,
    reason: decision.reason,
    ...(decision.amount === undefined ? {} : { amount: decision.amount }),
  };
}

function approvalDecisionToJson(decision: ApprovalDecisionRecord): JsonObject {
  return {
    decision: decision.decision,
    ...(decision.comment === undefined ? {} : { comment: decision.comment }),
  };
}

function actionResultToJson(result: ActionExecutionResult): JsonObject {
  return { actionId: result.actionId, status: result.status, message: result.message };
}

function escalationToJson(record: EscalationRecord): JsonObject {
  return { escalationId: record.escalationId, reason: record.reason, summary: record.summary };
}

function parseIntent(raw: JsonValue): SupportIntent {
  if (
    raw !== "order-status" &&
    raw !== "shipment-delay" &&
    raw !== "refund-request" &&
    raw !== "cancel-order" &&
    raw !== "unknown"
  ) {
    throw new Error("intent value is invalid.");
  }
  return raw;
}

function parseRoute(raw: JsonValue): WorkflowRoute {
  if (raw !== "reply-only" && raw !== "auto-action" && raw !== "needs-approval" && raw !== "escalate") {
    throw new Error("route value is invalid.");
  }
  return raw;
}

function parsePolicyDecision(raw: JsonValue): PolicyDecision {
  if (!isJsonRecord(raw)) {
    throw new Error("policyDecision must be an object.");
  }
  const eligible = raw["eligible"];
  const action = raw["action"];
  const requiresApproval = raw["requiresApproval"];
  const reason = raw["reason"];
  if (
    typeof eligible !== "boolean" ||
    typeof requiresApproval !== "boolean" ||
    typeof reason !== "string" ||
    (action !== "reply-only" && action !== "refund" && action !== "cancel" && action !== "escalate")
  ) {
    throw new Error("policyDecision is malformed.");
  }
  const amount = raw["amount"];
  return {
    eligible,
    action,
    requiresApproval,
    reason,
    ...(typeof amount === "number" ? { amount } : {}),
  };
}

function parseOptionalCustomer(raw: JsonValue | undefined): Customer | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isJsonRecord(raw)) {
    throw new Error("customer must be an object.");
  }
  const id = raw["id"];
  const name = raw["name"];
  const primaryOrderId = raw["primaryOrderId"];
  if (typeof id !== "string" || typeof name !== "string" || typeof primaryOrderId !== "string") {
    throw new Error("customer is malformed.");
  }
  const tier = raw["tier"];
  return {
    id,
    name,
    primaryOrderId,
    ...(tier === "standard" || tier === "premium" ? { tier } : {}),
  };
}

function parseOptionalOrder(raw: JsonValue | undefined): Order | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isJsonRecord(raw)) {
    throw new Error("order must be an object.");
  }
  const id = raw["id"];
  const customerId = raw["customerId"];
  const status = raw["status"];
  const totalAmount = raw["totalAmount"];
  const currency = raw["currency"];
  const placedAt = raw["placedAt"];
  if (
    typeof id !== "string" ||
    typeof customerId !== "string" ||
    typeof totalAmount !== "number" ||
    typeof currency !== "string" ||
    typeof placedAt !== "string" ||
    (status !== "processing" && status !== "shipped" && status !== "delivered" && status !== "cancelled")
  ) {
    throw new Error("order is malformed.");
  }
  const deliveredAt = raw["deliveredAt"];
  const shipmentId = raw["shipmentId"];
  return {
    id,
    customerId,
    status,
    totalAmount,
    currency,
    placedAt,
    ...(typeof deliveredAt === "string" ? { deliveredAt } : {}),
    ...(typeof shipmentId === "string" ? { shipmentId } : {}),
  };
}

function parseOptionalShipment(raw: JsonValue | undefined): Shipment | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isJsonRecord(raw)) {
    throw new Error("shipment must be an object.");
  }
  const id = raw["id"];
  const status = raw["status"];
  if (
    typeof id !== "string" ||
    (status !== "label-created" && status !== "in-transit" && status !== "delayed" && status !== "delivered")
  ) {
    throw new Error("shipment is malformed.");
  }
  const expectedDeliveryDate = raw["expectedDeliveryDate"];
  return {
    id,
    status,
    ...(typeof expectedDeliveryDate === "string" ? { expectedDeliveryDate } : {}),
  };
}

function parseOptionalApprovalDecision(raw: JsonValue | undefined): ApprovalDecisionRecord | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isJsonRecord(raw)) {
    throw new Error("approvalDecision must be an object.");
  }
  const decision = raw["decision"];
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    throw new Error("approvalDecision.decision is invalid.");
  }
  const comment = raw["comment"];
  return {
    decision,
    ...(typeof comment === "string" ? { comment } : {}),
  };
}

function parseOptionalActionResult(raw: JsonValue | undefined): ActionExecutionResult | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isJsonRecord(raw)) {
    throw new Error("actionResult must be an object.");
  }
  const actionId = raw["actionId"];
  const status = raw["status"];
  const message = raw["message"];
  if (
    typeof actionId !== "string" ||
    typeof message !== "string" ||
    (status !== "completed" && status !== "already-completed" && status !== "rejected")
  ) {
    throw new Error("actionResult is malformed.");
  }
  return { actionId, status, message };
}

function parseOptionalEscalation(raw: JsonValue | undefined): EscalationRecord | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isJsonRecord(raw)) {
    throw new Error("escalation must be an object.");
  }
  const escalationId = raw["escalationId"];
  const reason = raw["reason"];
  const summary = raw["summary"];
  if (typeof escalationId !== "string" || typeof reason !== "string" || typeof summary !== "string") {
    throw new Error("escalation is malformed.");
  }
  return { escalationId, reason, summary };
}

function extractCustomerFromToolResult(raw: JsonValue): Customer {
  if (!isJsonRecord(raw)) {
    throw new Error("get_customer returned a non-object result.");
  }
  const customer = raw["customer"];
  const parsed = parseOptionalCustomer(customer);
  if (parsed === undefined) {
    throw new Error("get_customer result is missing customer.");
  }
  return parsed;
}

function extractOrderFromToolResult(raw: JsonValue): Order {
  if (!isJsonRecord(raw)) {
    throw new Error("get_order returned a non-object result.");
  }
  const order = raw["order"];
  const parsed = parseOptionalOrder(order);
  if (parsed === undefined) {
    throw new Error("get_order result is missing order.");
  }
  return parsed;
}

function extractShipmentFromToolResult(raw: JsonValue): Shipment {
  if (!isJsonRecord(raw)) {
    throw new Error("get_shipment returned a non-object result.");
  }
  const shipment = raw["shipment"];
  const parsed = parseOptionalShipment(shipment);
  if (parsed === undefined) {
    throw new Error("get_shipment result is missing shipment.");
  }
  return parsed;
}

function extractActionResultFromToolResult(raw: JsonValue): ActionExecutionResult {
  if (!isJsonRecord(raw)) {
    throw new Error("support action tool returned a non-object result.");
  }
  const result = raw["result"];
  const parsed = parseOptionalActionResult(result);
  if (parsed === undefined) {
    throw new Error("support action tool result is missing result.");
  }
  return parsed;
}
