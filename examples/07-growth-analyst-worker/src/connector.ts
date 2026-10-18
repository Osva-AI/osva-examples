import { defineConnector, defineTool } from "@osva-ai/connector-sdk";

import {
  getFixtureCampaign,
  getFixtureFunnel,
  getFixtureRetention,
  getFixtureRevenue,
  getFixtureTraffic,
} from "./fixtures.js";
import type { CampaignMetrics, FunnelCounts, RetentionMetrics, RevenueMetrics, TrafficMetrics } from "./types.js";

function readBusinessId(input: unknown): string {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("businessId must be a string");
  }
  const businessId = (input as Record<string, unknown>)["businessId"];
  if (typeof businessId !== "string" || businessId.trim().length === 0) {
    throw new Error("businessId must be a string");
  }
  return businessId.trim();
}

export async function executeGetTrafficMetrics(input: unknown): Promise<{ traffic: TrafficMetrics }> {
  const businessId = readBusinessId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_traffic_metrics.invoked", businessId })}\n`);
  return { traffic: getFixtureTraffic(businessId) };
}

export async function executeGetFunnelMetrics(input: unknown): Promise<{ funnel: FunnelCounts }> {
  const businessId = readBusinessId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_funnel_metrics.invoked", businessId })}\n`);
  return { funnel: getFixtureFunnel(businessId) };
}

export async function executeGetRevenueMetrics(input: unknown): Promise<{ revenue: RevenueMetrics }> {
  const businessId = readBusinessId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_revenue_metrics.invoked", businessId })}\n`);
  return { revenue: getFixtureRevenue(businessId) };
}

export async function executeGetRetentionMetrics(input: unknown): Promise<{ retention: RetentionMetrics }> {
  const businessId = readBusinessId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_retention_metrics.invoked", businessId })}\n`);
  return { retention: getFixtureRetention(businessId) };
}

export async function executeGetCampaignMetrics(input: unknown): Promise<{ campaign: CampaignMetrics }> {
  const businessId = readBusinessId(input);
  process.stderr.write(`${JSON.stringify({ event: "mcp.get_campaign_metrics.invoked", businessId })}\n`);
  return { campaign: getFixtureCampaign(businessId) };
}

const businessIdSchema = {
  type: "object",
  properties: { businessId: { type: "string" } },
  required: ["businessId"],
  additionalProperties: false,
} as const;

export const getTrafficMetricsTool = defineTool({
  name: "get_traffic_metrics",
  description:
    "Returns deterministic traffic and channel breakdown fixtures. " + "Replace with GA4 or similar in production.",
  inputSchema: businessIdSchema,
  handler: executeGetTrafficMetrics,
});

export const getFunnelMetricsTool = defineTool({
  name: "get_funnel_metrics",
  description: "Returns deterministic ecommerce funnel counts. Replace with product analytics in production.",
  inputSchema: businessIdSchema,
  handler: executeGetFunnelMetrics,
});

export const getRevenueMetricsTool = defineTool({
  name: "get_revenue_metrics",
  description: "Returns deterministic order and revenue fixtures. Replace with Shopify/Stripe in production.",
  inputSchema: businessIdSchema,
  handler: executeGetRevenueMetrics,
});

export const getRetentionMetricsTool = defineTool({
  name: "get_retention_metrics",
  description: "Returns deterministic repeat-purchase fixtures. Replace with CRM/CDP cohort data in production.",
  inputSchema: businessIdSchema,
  handler: executeGetRetentionMetrics,
});

export const getCampaignMetricsTool = defineTool({
  name: "get_campaign_metrics",
  description: "Returns deterministic paid-media fixtures. Replace with Meta/Google Ads connectors in production.",
  inputSchema: businessIdSchema,
  handler: executeGetCampaignMetrics,
});

export const growthDataConnector = defineConnector({
  key: "osva-examples-growth-data",
  name: "OSVA Examples Growth Data",
  description: "Fixture-backed growth metrics for the growth analyst worker example.",
  version: "1.0.0",
  tools: [
    getTrafficMetricsTool,
    getFunnelMetricsTool,
    getRevenueMetricsTool,
    getRetentionMetricsTool,
    getCampaignMetricsTool,
  ],
});
