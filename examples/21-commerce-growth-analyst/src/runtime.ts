import type { JsonObject, JsonValue, ToolVersionId } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";

import { runCommerceGrowthAnalystAgent } from "./agent.js";
import type { TrustedCommerceGrowthContext } from "./agent-types.js";
import {
  TOOL_BINDING_GA4_PROPERTY_GET,
  TOOL_BINDING_GA4_REPORT_ACQUISITION,
  TOOL_BINDING_GA4_REPORT_ECOMMERCE,
  TOOL_BINDING_SHOPIFY_ORDER_LIST,
  TOOL_BINDING_SHOPIFY_PRODUCT_LIST,
  TOOL_BINDING_SHOPIFY_SHOP_GET,
} from "./bindings.js";

export const commerceGrowthRuntime = createRuntime({
  execute: async (input, context) => {
    const adapted: TrustedCommerceGrowthContext = {
      input,
      tools: {
        invoke: (binding, toolInput, options) =>
          context.tools.invoke({
            binding,
            input: toolInput as JsonValue,
            ...(options?.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
          }),
      },
    };

    const output = await runCommerceGrowthAnalystAgent(adapted);
    return output as unknown as JsonObject;
  },
});

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    startDate: { type: "string", minLength: 10, maxLength: 10 },
    endDate: { type: "string", minLength: 10, maxLength: 10 },
    ga4PropertyId: { type: "string", minLength: 1 },
    maxOrderSampleSize: { type: "integer", minimum: 1, maximum: 100 },
    maxProductSampleSize: { type: "integer", minimum: 1, maximum: 50 },
    orderListPageLimit: { type: "integer", minimum: 1, maximum: 5 },
    productListPageLimit: { type: "integer", minimum: 1, maximum: 5 },
    ga4ReportLimit: { type: "integer", minimum: 1, maximum: 100 },
    runKey: { type: "string", minLength: 1 },
  },
  required: ["startDate", "endDate", "ga4PropertyId", "maxOrderSampleSize", "maxProductSampleSize"],
  additionalProperties: false,
} as const;

type ToolVersionMap = {
  readonly shopifyShopGet: ToolVersionId;
  readonly shopifyProductList: ToolVersionId;
  readonly shopifyOrderList: ToolVersionId;
  readonly ga4PropertyGet: ToolVersionId;
  readonly ga4ReportAcquisition: ToolVersionId;
  readonly ga4ReportEcommerce: ToolVersionId;
};

function buildManifestBase(toolVersionIds: ToolVersionMap) {
  return {
    schemaVersion: "1" as const,
    key: "commerce-growth-analyst",
    name: "Commerce & Growth Analyst",
    input: { schema: INPUT_SCHEMA },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 180_000, maxAttempts: 1 },
    capabilities: {
      model: false,
      tools: [
        TOOL_BINDING_SHOPIFY_SHOP_GET,
        TOOL_BINDING_SHOPIFY_PRODUCT_LIST,
        TOOL_BINDING_SHOPIFY_ORDER_LIST,
        TOOL_BINDING_GA4_PROPERTY_GET,
        TOOL_BINDING_GA4_REPORT_ACQUISITION,
        TOOL_BINDING_GA4_REPORT_ECOMMERCE,
      ],
    },
    tools: {
      [TOOL_BINDING_SHOPIFY_SHOP_GET]: { toolVersionId: toolVersionIds.shopifyShopGet },
      [TOOL_BINDING_SHOPIFY_PRODUCT_LIST]: { toolVersionId: toolVersionIds.shopifyProductList },
      [TOOL_BINDING_SHOPIFY_ORDER_LIST]: { toolVersionId: toolVersionIds.shopifyOrderList },
      [TOOL_BINDING_GA4_PROPERTY_GET]: { toolVersionId: toolVersionIds.ga4PropertyGet },
      [TOOL_BINDING_GA4_REPORT_ACQUISITION]: { toolVersionId: toolVersionIds.ga4ReportAcquisition },
      [TOOL_BINDING_GA4_REPORT_ECOMMERCE]: { toolVersionId: toolVersionIds.ga4ReportEcommerce },
    },
  };
}

export function buildRemoteHttpManifest(runtimeUrl: string, toolVersionIds: ToolVersionMap) {
  return {
    ...buildManifestBase(toolVersionIds),
    runtime: {
      type: "REMOTE_HTTP" as const,
      protocolVersion: "1" as const,
      endpoint: runtimeUrl,
      timeoutMs: 180_000,
    },
  };
}

export function buildTrustedTypeScriptManifest(entrypoint: string, integrity: string, toolVersionIds: ToolVersionMap) {
  return {
    ...buildManifestBase(toolVersionIds),
    runtime: {
      type: "TRUSTED_TYPESCRIPT" as const,
      entrypoint,
      integrity,
    },
  };
}
