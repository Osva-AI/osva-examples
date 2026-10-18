import { workflowDefinitionSchema } from "@osva-ai/contracts/schemas";
import { describe, expect, it, vi } from "vitest";

import { cancelOrder, issueRefund } from "../src/actions.js";
import { classifySupportIntent } from "../src/classifier.js";
import { executeGetCustomer, executeGetOrder, executeGetShipment, executeIssueRefund } from "../src/connector.js";
import {
  getFixtureCustomer,
  getFixtureShipment,
  getPrimaryOrderForCustomer,
  resetSupportFixtureState,
} from "../src/fixtures.js";
import { DEFAULT_CUSTOMER_ID, DEFAULT_SUPPORT_MESSAGE, validateSupportWorkerInput } from "../src/input.js";
import { evaluateSupportPolicy, planWorkflowRoute } from "../src/policy.js";
import { generateCustomerResponse } from "../src/response.js";
import {
  GET_CUSTOMER_TOOL_BINDING,
  ISSUE_REFUND_TOOL_BINDING,
  buildCustomerSupportAgentManifest,
} from "../src/runtime.js";
import {
  ACTION_NODE,
  APPROVAL_NODE,
  BRANCH_NODE,
  CLASSIFY_NODE,
  LOOKUP_NODE,
  POLICY_NODE,
  RESOLUTION_NODE,
  RESPONSE_NODE,
  WORKFLOW_LINEAR_STAGE_ORDER,
  buildWorkflowDefinition,
} from "../src/workflow.js";

function loadDemoContext(customerId: string) {
  const customer = getFixtureCustomer(customerId);
  const order = getPrimaryOrderForCustomer(customerId);
  const shipment = order?.shipmentId === undefined ? undefined : getFixtureShipment(order.shipmentId);
  return { customer, order, shipment };
}

describe("customer support worker public contracts", () => {
  it("validates support request input bounds", () => {
    expect(validateSupportWorkerInput({ customerId: DEFAULT_CUSTOMER_ID, message: DEFAULT_SUPPORT_MESSAGE })).toEqual({
      customerId: DEFAULT_CUSTOMER_ID,
      message: DEFAULT_SUPPORT_MESSAGE,
    });
    expect(() => validateSupportWorkerInput({ customerId: "ab", message: "hello" })).toThrow(/customerId/);
    expect(() => validateSupportWorkerInput({ customerId: DEFAULT_CUSTOMER_ID, message: "hi" })).toThrow(
      /5 characters/,
    );
  });

  it("classifies supported intents deterministically", () => {
    expect(classifySupportIntent("My order is already late. I want a refund.")).toBe("refund-request");
    expect(classifySupportIntent("Please cancel my order")).toBe("cancel-order");
    expect(classifySupportIntent("Where is my shipment?")).toBe("order-status");
    expect(classifySupportIntent("It is delayed again")).toBe("shipment-delay");
    expect(classifySupportIntent("Hello there")).toBe("unknown");
  });

  it("loads customer and order fixtures through MCP handlers", async () => {
    resetSupportFixtureState();
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const customer = await executeGetCustomer({ customerId: DEFAULT_CUSTOMER_ID });
    const order = await executeGetOrder({ orderId: customer.customer?.primaryOrderId ?? "" });
    write.mockRestore();
    expect(customer.customer?.id).toBe(DEFAULT_CUSTOMER_ID);
    expect(order.order?.id).toBe("ord-delay-40");
  });

  it("handles delayed shipment refund eligibility for low-value orders", () => {
    resetSupportFixtureState();
    const { customer, order, shipment } = loadDemoContext(DEFAULT_CUSTOMER_ID);
    const policy = evaluateSupportPolicy({
      intent: "refund-request",
      customer,
      order,
      shipment,
      message: DEFAULT_SUPPORT_MESSAGE,
    });
    expect(policy.eligible).toBe(true);
    expect(policy.action).toBe("refund");
    expect(policy.requiresApproval).toBe(false);
    expect(planWorkflowRoute(policy)).toBe("auto-action");
  });

  it("requires approval for high-value delayed refunds", () => {
    resetSupportFixtureState();
    const { customer, order, shipment } = loadDemoContext("cust-enterprise-001");
    const policy = evaluateSupportPolicy({
      intent: "refund-request",
      customer,
      order,
      shipment,
      message: "Refund my late order",
    });
    expect(policy.requiresApproval).toBe(true);
    expect(planWorkflowRoute(policy)).toBe("needs-approval");
  });

  it("marks ineligible refunds on delivered orders outside the demo window", () => {
    resetSupportFixtureState();
    const customer = getFixtureCustomer("cust-archive-001");
    const order = getPrimaryOrderForCustomer("cust-archive-001");
    const policy = evaluateSupportPolicy({
      intent: "refund-request",
      customer,
      order,
      shipment: order?.shipmentId === undefined ? undefined : { id: order.shipmentId, status: "delivered" },
      message: "I want a refund",
    });
    expect(policy.eligible).toBe(false);
    expect(policy.action).toBe("reply-only");
  });

  it("allows cancellation for undelivered delayed orders", () => {
    resetSupportFixtureState();
    const { customer, order, shipment } = loadDemoContext(DEFAULT_CUSTOMER_ID);
    const policy = evaluateSupportPolicy({
      intent: "cancel-order",
      customer,
      order,
      shipment,
      message: "Cancel this delayed order",
    });
    expect(policy.action).toBe("cancel");
    expect(planWorkflowRoute(policy)).toBe("auto-action");
  });

  it("executes idempotent refund actions", () => {
    resetSupportFixtureState();
    const actionId = "ticket-demo-refund-001";
    const first = issueRefund({ orderId: "ord-delay-40", amount: 40, actionId });
    const second = issueRefund({ orderId: "ord-delay-40", amount: 40, actionId });
    expect(first.status).toBe("completed");
    expect(second.status).toBe("already-completed");
  });

  it("executes idempotent cancellation actions", () => {
    resetSupportFixtureState();
    const actionId = "ticket-demo-cancel-001";
    const first = cancelOrder({ orderId: "ord-delay-40", actionId });
    const second = cancelOrder({ orderId: "ord-delay-40", actionId });
    expect(first.status).toBe("completed");
    expect(second.status).toBe("already-completed");
  });

  it("does not claim refund success when approval is rejected", () => {
    const response = generateCustomerResponse({
      request: { ticketId: "t-1", customerId: DEFAULT_CUSTOMER_ID, message: DEFAULT_SUPPORT_MESSAGE },
      intent: "refund-request",
      customer: getFixtureCustomer(DEFAULT_CUSTOMER_ID),
      order: getPrimaryOrderForCustomer(DEFAULT_CUSTOMER_ID),
      policyDecision: {
        eligible: true,
        action: "refund",
        requiresApproval: true,
        reason: "High value",
        amount: 900,
      },
      approvalDecision: { decision: "REJECTED" },
    });
    expect(response).toMatch(/No refund was applied|No refund/i);
    expect(response).not.toMatch(/processed/);
  });

  it("escalates unknown intents", () => {
    resetSupportFixtureState();
    const { customer, order } = loadDemoContext(DEFAULT_CUSTOMER_ID);
    const policy = evaluateSupportPolicy({
      intent: "unknown",
      customer,
      order,
      shipment: undefined,
      message: "Random question",
    });
    expect(policy.action).toBe("escalate");
    expect(planWorkflowRoute(policy)).toBe("escalate");
  });

  it("matches final response to completed refund actions", async () => {
    resetSupportFixtureState();
    const result = await executeIssueRefund({ orderId: "ord-delay-40", amount: 40, actionId: "ticket-resp-001" });
    const response = generateCustomerResponse({
      request: { ticketId: "t-2", customerId: DEFAULT_CUSTOMER_ID, message: DEFAULT_SUPPORT_MESSAGE },
      intent: "refund-request",
      customer: getFixtureCustomer(DEFAULT_CUSTOMER_ID),
      order: getPrimaryOrderForCustomer(DEFAULT_CUSTOMER_ID),
      policyDecision: {
        eligible: true,
        action: "refund",
        requiresApproval: false,
        reason: "Delayed shipment",
        amount: 40,
      },
      actionResult: result.result,
    });
    expect(response).toMatch(/refund of USD 40\.00/i);
    expect(response).toMatch(/processed/i);
  });

  it("builds a V3 workflow with branch routing and approval", () => {
    const definition = buildWorkflowDefinition("agent_version_test" as never);
    expect(() => workflowDefinitionSchema.parse(definition)).not.toThrow();
    expect(definition.nodes.find((node) => node.key === BRANCH_NODE)?.type).toBe("BRANCH");
    expect(definition.nodes.find((node) => node.key === APPROVAL_NODE)?.type).toBe("APPROVAL");
    expect(WORKFLOW_LINEAR_STAGE_ORDER).toEqual([
      CLASSIFY_NODE,
      LOOKUP_NODE,
      POLICY_NODE,
      RESOLUTION_NODE,
      BRANCH_NODE,
    ]);
    expect(definition.nodes.some((node) => node.key === ACTION_NODE)).toBe(true);
    expect(definition.nodes.some((node) => node.key === RESPONSE_NODE)).toBe(true);
  });

  it("binds lookup and action tools in the agent manifest without credentials", () => {
    const manifest = buildCustomerSupportAgentManifest("http://127.0.0.1:8796/execute", {
      getCustomer: "tool_customer" as never,
      getOrder: "tool_order" as never,
      getShipment: "tool_shipment" as never,
      issueRefund: "tool_refund" as never,
      cancelOrder: "tool_cancel" as never,
    });
    expect(manifest.capabilities.tools).toContain(GET_CUSTOMER_TOOL_BINDING);
    expect(manifest.capabilities.tools).toContain(ISSUE_REFUND_TOOL_BINDING);
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key|authorization|bearer/i);
  });

  it("loads shipment data for delayed order lookups", async () => {
    resetSupportFixtureState();
    const shipment = await executeGetShipment({ shipmentId: "ship-delay-40" });
    expect(shipment.shipment?.status).toBe("delayed");
  });

  it("rejects failed refund actions in customer responses", () => {
    const response = generateCustomerResponse({
      request: { ticketId: "t-3", customerId: DEFAULT_CUSTOMER_ID, message: DEFAULT_SUPPORT_MESSAGE },
      intent: "refund-request",
      customer: getFixtureCustomer(DEFAULT_CUSTOMER_ID),
      order: getPrimaryOrderForCustomer(DEFAULT_CUSTOMER_ID),
      policyDecision: {
        eligible: true,
        action: "refund",
        requiresApproval: false,
        reason: "demo",
        amount: 40,
      },
      actionResult: { actionId: "x", status: "rejected", message: "Tool failure" },
    });
    expect(response).toMatch(/could not complete/i);
    expect(response).not.toMatch(/has been approved and processed/i);
  });
});
