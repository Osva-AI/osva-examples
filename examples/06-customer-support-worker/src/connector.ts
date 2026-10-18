import { defineConnector, defineTool } from "@osva-ai/connector-sdk";

import { cancelOrder, issueRefund } from "./actions.js";
import { getFixtureCustomer, getFixtureOrder, getFixtureShipment, getPrimaryOrderForCustomer } from "./fixtures.js";

export async function executeGetCustomer(input: unknown): Promise<{ customer: ReturnType<typeof getFixtureCustomer> }> {
  const customerId = readRequiredString(input, "customerId");
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_customer.invoked", customerId })}\n`);
  const customer = getFixtureCustomer(customerId);
  if (customer === undefined) {
    throw new Error(`Customer '${customerId}' was not found in demo fixtures.`);
  }
  return { customer: { ...customer } };
}

export async function executeGetOrder(input: unknown): Promise<{ order: ReturnType<typeof getFixtureOrder> }> {
  const orderId = readRequiredString(input, "orderId");
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_order.invoked", orderId })}\n`);
  const order = getFixtureOrder(orderId);
  if (order === undefined) {
    throw new Error(`Order '${orderId}' was not found in demo fixtures.`);
  }
  return { order: { ...order } };
}

export async function executeGetShipment(input: unknown): Promise<{ shipment: ReturnType<typeof getFixtureShipment> }> {
  const shipmentId = readRequiredString(input, "shipmentId");
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_shipment.invoked", shipmentId })}\n`);
  const shipment = getFixtureShipment(shipmentId);
  if (shipment === undefined) {
    throw new Error(`Shipment '${shipmentId}' was not found in demo fixtures.`);
  }
  return { shipment: { ...shipment } };
}

export async function executeIssueRefund(input: unknown): Promise<{ result: ReturnType<typeof issueRefund> }> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("issue_refund input must be an object.");
  }
  const record = input as Record<string, unknown>;
  const orderId = readRequiredString(record, "orderId");
  const actionId = readRequiredString(record, "actionId");
  const amount = record["amount"];
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new Error("amount must be a number.");
  }
  process.stderr.write(`${JSON.stringify({ event: "mcp.issue_refund.invoked", orderId, actionId })}\n`);
  return { result: issueRefund({ orderId, amount, actionId }) };
}

export async function executeCancelOrder(input: unknown): Promise<{ result: ReturnType<typeof cancelOrder> }> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("cancel_order input must be an object.");
  }
  const record = input as Record<string, unknown>;
  const orderId = readRequiredString(record, "orderId");
  const actionId = readRequiredString(record, "actionId");
  process.stderr.write(`${JSON.stringify({ event: "mcp.cancel_order.invoked", orderId, actionId })}\n`);
  return { result: cancelOrder({ orderId, actionId }) };
}

export const getCustomerTool = defineTool({
  name: "get_customer",
  description: "Returns a demo customer record and primary order id from local fixtures.",
  inputSchema: {
    type: "object",
    properties: { customerId: { type: "string" } },
    required: ["customerId"],
    additionalProperties: false,
  },
  handler: executeGetCustomer,
});

export const getOrderTool = defineTool({
  name: "get_order",
  description: "Returns a demo order record from local fixtures.",
  inputSchema: {
    type: "object",
    properties: { orderId: { type: "string" } },
    required: ["orderId"],
    additionalProperties: false,
  },
  handler: executeGetOrder,
});

export const getShipmentTool = defineTool({
  name: "get_shipment",
  description: "Returns a demo shipment record from local fixtures.",
  inputSchema: {
    type: "object",
    properties: { shipmentId: { type: "string" } },
    required: ["shipmentId"],
    additionalProperties: false,
  },
  handler: executeGetShipment,
});

export const issueRefundTool = defineTool({
  name: "issue_refund",
  description:
    "Simulates a controlled refund side effect in demo fixture state. " +
    "Replace with a payment gateway connector in production.",
  inputSchema: {
    type: "object",
    properties: {
      orderId: { type: "string" },
      amount: { type: "number" },
      actionId: { type: "string" },
    },
    required: ["orderId", "amount", "actionId"],
    additionalProperties: false,
  },
  handler: executeIssueRefund,
});

export const cancelOrderTool = defineTool({
  name: "cancel_order",
  description:
    "Simulates order cancellation in demo fixture state. " + "Replace with an OMS/commerce connector in production.",
  inputSchema: {
    type: "object",
    properties: {
      orderId: { type: "string" },
      actionId: { type: "string" },
    },
    required: ["orderId", "actionId"],
    additionalProperties: false,
  },
  handler: executeCancelOrder,
});

export const supportConnector = defineConnector({
  key: "osva-examples-support",
  name: "OSVA Examples Support",
  description: "Fixture-backed support lookup and controlled action tools for the customer support worker.",
  version: "1.0.0",
  tools: [getCustomerTool, getOrderTool, getShipmentTool, issueRefundTool, cancelOrderTool],
});

export function resolvePrimaryOrderForCustomer(customerId: string) {
  return getPrimaryOrderForCustomer(customerId);
}

function readRequiredString(input: unknown, field: string): string {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const value = (input as Record<string, unknown>)[field];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  throw new Error(`${field} must be a non-empty string.`);
}
