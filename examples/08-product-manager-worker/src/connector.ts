import { defineConnector, defineTool } from "@osva-ai/connector-sdk";

import {
  getFixtureCustomerFeedback,
  getFixtureProductContext,
  getFixtureProductMetrics,
  getFixtureSupportTickets,
} from "./fixtures.js";
import type { CustomerFeedback, ProductContext, ProductMetrics, SupportTicket } from "./types.js";

function readProductId(input: unknown): string {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("productId must be a string");
  }
  const productId = (input as Record<string, unknown>)["productId"];
  if (typeof productId !== "string" || productId.trim().length === 0) {
    throw new Error("productId must be a string");
  }
  return productId.trim();
}

export async function executeGetCustomerFeedback(input: unknown): Promise<{ feedback: CustomerFeedback[] }> {
  const productId = readProductId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_customer_feedback.invoked", productId })}\n`);
  return { feedback: [...getFixtureCustomerFeedback(productId)] };
}

export async function executeGetSupportTickets(input: unknown): Promise<{ tickets: SupportTicket[] }> {
  const productId = readProductId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_support_tickets.invoked", productId })}\n`);
  return { tickets: [...getFixtureSupportTickets(productId)] };
}

export async function executeGetProductMetrics(input: unknown): Promise<{ metrics: ProductMetrics }> {
  const productId = readProductId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_product_metrics.invoked", productId })}\n`);
  return { metrics: getFixtureProductMetrics(productId) };
}

export async function executeGetProductContext(input: unknown): Promise<{ context: ProductContext }> {
  const productId = readProductId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_product_context.invoked", productId })}\n`);
  return { context: getFixtureProductContext(productId) };
}

const productIdSchema = {
  type: "object",
  properties: { productId: { type: "string" } },
  required: ["productId"],
  additionalProperties: false,
} as const;

export const getCustomerFeedbackTool = defineTool({
  name: "get_customer_feedback",
  description: "Returns deterministic customer feedback fixtures. Replace with Productboard/Intercom in production.",
  inputSchema: productIdSchema,
  handler: executeGetCustomerFeedback,
});

export const getSupportTicketsTool = defineTool({
  name: "get_support_tickets",
  description: "Returns deterministic support ticket fixtures. Replace with Zendesk/Intercom in production.",
  inputSchema: productIdSchema,
  handler: executeGetSupportTickets,
});

export const getProductMetricsTool = defineTool({
  name: "get_product_metrics",
  description: "Returns deterministic product analytics fixtures. Replace with Amplitude/Mixpanel in production.",
  inputSchema: productIdSchema,
  handler: executeGetProductMetrics,
});

export const getProductContextTool = defineTool({
  name: "get_product_context",
  description: "Returns business and product context fixtures. Replace with strategy docs/CRM in production.",
  inputSchema: productIdSchema,
  handler: executeGetProductContext,
});

export const productDataConnector = defineConnector({
  key: "osva-examples-product-data",
  name: "OSVA Examples Product Data",
  description: "Fixture-backed product evidence for the product manager worker example.",
  version: "1.0.0",
  tools: [getCustomerFeedbackTool, getSupportTicketsTool, getProductMetricsTool, getProductContextTool],
});
