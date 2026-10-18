import { defineConnector, defineTool } from "@osva-ai/connector-sdk";

import {
  executeDemoAction,
  getFixtureCampaignMetrics,
  getFixtureCommerceMetrics,
  getFixtureContentSignals,
  getFixtureCustomerSignals,
  getFixtureFunnelMetrics,
  getFixtureProductContext,
} from "./fixtures.js";
import type {
  CampaignMetrics,
  CommerceMetrics,
  ContentSignal,
  CustomerSignal,
  FunnelMetrics,
  ProductContext,
} from "./types.js";

function readBusinessId(input: unknown): string {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("businessId must be provided in an object.");
  }
  const businessId = (input as Record<string, unknown>)["businessId"];
  if (typeof businessId !== "string" || businessId.trim().length === 0) {
    throw new Error("businessId must be a non-empty string.");
  }
  return businessId.trim();
}

export async function executeGetCommerceMetrics(input: unknown): Promise<{ commerce: CommerceMetrics }> {
  const businessId = readBusinessId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_commerce_metrics.invoked", businessId })}\n`);
  return { commerce: getFixtureCommerceMetrics(businessId) };
}

export async function executeGetFunnelMetrics(input: unknown): Promise<{ funnel: FunnelMetrics }> {
  const businessId = readBusinessId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_funnel_metrics.invoked", businessId })}\n`);
  return { funnel: getFixtureFunnelMetrics(businessId) };
}

export async function executeGetCampaignMetrics(input: unknown): Promise<{ campaign: CampaignMetrics }> {
  const businessId = readBusinessId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_campaign_metrics.invoked", businessId })}\n`);
  return { campaign: getFixtureCampaignMetrics(businessId) };
}

export async function executeGetCustomerSignals(input: unknown): Promise<{ customerSignals: CustomerSignal[] }> {
  const businessId = readBusinessId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_customer_signals.invoked", businessId })}\n`);
  return { customerSignals: getFixtureCustomerSignals(businessId) };
}

export async function executeGetContentSignals(input: unknown): Promise<{ contentSignals: ContentSignal[] }> {
  const businessId = readBusinessId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_content_signals.invoked", businessId })}\n`);
  return { contentSignals: getFixtureContentSignals(businessId) };
}

export async function executeGetInventoryOrProductContext(input: unknown): Promise<{ products: ProductContext[] }> {
  const businessId = readBusinessId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_inventory_or_product_context.invoked", businessId })}\n`);
  return { products: getFixtureProductContext(businessId) };
}

export async function executeExecuteDemoAction(input: unknown): Promise<{
  result: ReturnType<typeof executeDemoAction>;
}> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("execute_demo_action input must be an object.");
  }
  const record = input as Record<string, unknown>;
  const businessId = readBusinessId(record);
  const actionId = record["actionId"];
  const actionType = record["actionType"];
  const title = record["title"];
  const monitoringMetric = record["monitoringMetric"];
  if (
    typeof actionId !== "string" ||
    typeof actionType !== "string" ||
    typeof title !== "string" ||
    typeof monitoringMetric !== "string"
  ) {
    throw new Error("actionId, actionType, title, and monitoringMetric are required strings.");
  }
  process.stderr.write(`${JSON.stringify({ event: "mcp.execute_demo_action.invoked", businessId, actionId })}\n`);
  return {
    result: executeDemoAction({ businessId, actionId, actionType, title, monitoringMetric }),
  };
}

const businessSchema = {
  type: "object",
  properties: { businessId: { type: "string" } },
  required: ["businessId"],
  additionalProperties: false,
} as const;

export const growthOpsConnector = defineConnector({
  key: "osva-examples-growth-ops",
  name: "OSVA Examples Growth Ops",
  description: "Fixture-backed growth, customer, content, and demo action tools.",
  version: "1.0.0",
  tools: [
    defineTool({
      name: "get_commerce_metrics",
      description: "Returns deterministic commerce metrics for a business.",
      inputSchema: businessSchema,
      handler: executeGetCommerceMetrics,
    }),
    defineTool({
      name: "get_funnel_metrics",
      description: "Returns deterministic funnel metrics for a business.",
      inputSchema: businessSchema,
      handler: executeGetFunnelMetrics,
    }),
    defineTool({
      name: "get_campaign_metrics",
      description: "Returns deterministic campaign performance metrics.",
      inputSchema: businessSchema,
      handler: executeGetCampaignMetrics,
    }),
    defineTool({
      name: "get_customer_signals",
      description: "Returns deterministic customer feedback signals.",
      inputSchema: businessSchema,
      handler: executeGetCustomerSignals,
    }),
    defineTool({
      name: "get_content_signals",
      description: "Returns deterministic SEO/content performance signals.",
      inputSchema: businessSchema,
      handler: executeGetContentSignals,
    }),
    defineTool({
      name: "get_inventory_or_product_context",
      description: "Returns deterministic product and inventory context.",
      inputSchema: businessSchema,
      handler: executeGetInventoryOrProductContext,
    }),
    defineTool({
      name: "execute_demo_action",
      description: "Records a simulated growth operation in demo fixture state only.",
      inputSchema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          actionId: { type: "string" },
          actionType: { type: "string" },
          title: { type: "string" },
          monitoringMetric: { type: "string" },
        },
        required: ["businessId", "actionId", "actionType", "title", "monitoringMetric"],
        additionalProperties: false,
      },
      handler: executeExecuteDemoAction,
    }),
  ],
});
