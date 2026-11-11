import {
  GA4_METADATA_GET_TOOL,
  GA4_PROPERTY_GET_TOOL,
  GA4_PROPERTY_LIST_TOOL,
  GA4_REPORT_ACQUISITION_TOOL,
  GA4_REPORT_ECOMMERCE_TOOL,
  GA4_REPORT_REALTIME_TOOL,
  GA4_REPORT_RUN_TOOL,
} from "@osva-ai/connector-ga4";
import {
  SHOPIFY_INVENTORY_LEVELS_LIST_TOOL,
  SHOPIFY_LOCATION_LIST_TOOL,
  SHOPIFY_ORDER_GET_TOOL,
  SHOPIFY_ORDER_LIST_TOOL,
  SHOPIFY_PRODUCT_GET_TOOL,
  SHOPIFY_PRODUCT_LIST_TOOL,
  SHOPIFY_SHOP_GET_TOOL,
} from "@osva-ai/connector-shopify";

export const APPROVED_SHOPIFY_READ_TOOLS = new Set<string>([
  SHOPIFY_SHOP_GET_TOOL,
  SHOPIFY_PRODUCT_LIST_TOOL,
  SHOPIFY_ORDER_LIST_TOOL,
]);

export const APPROVED_GA4_READ_TOOLS = new Set<string>([
  GA4_PROPERTY_GET_TOOL,
  GA4_REPORT_ACQUISITION_TOOL,
  GA4_REPORT_ECOMMERCE_TOOL,
]);

export const APPROVED_READ_TOOLS = new Set<string>([...APPROVED_SHOPIFY_READ_TOOLS, ...APPROVED_GA4_READ_TOOLS]);

export const DISALLOWED_SHOPIFY_TOOLS = new Set<string>([
  SHOPIFY_PRODUCT_GET_TOOL,
  SHOPIFY_ORDER_GET_TOOL,
  SHOPIFY_INVENTORY_LEVELS_LIST_TOOL,
  SHOPIFY_LOCATION_LIST_TOOL,
]);

export const DISALLOWED_GA4_TOOLS = new Set<string>([
  GA4_PROPERTY_LIST_TOOL,
  GA4_METADATA_GET_TOOL,
  GA4_REPORT_RUN_TOOL,
  GA4_REPORT_REALTIME_TOOL,
]);

export function assertShopifyReadOnlyDiscovery(remoteToolNames: readonly string[]): void {
  for (const required of APPROVED_SHOPIFY_READ_TOOLS) {
    if (!remoteToolNames.includes(required)) {
      throw new Error(`Shopify MCP discovery missing required read-only tool: ${required}`);
    }
  }
}

export function assertGa4ReadOnlyDiscovery(remoteToolNames: readonly string[]): void {
  for (const required of APPROVED_GA4_READ_TOOLS) {
    if (!remoteToolNames.includes(required)) {
      throw new Error(`GA4 MCP discovery missing required read-only tool: ${required}`);
    }
  }
}

export function assertImportedToolsAreReadOnly(importedRemoteNames: readonly string[]): void {
  for (const name of importedRemoteNames) {
    if (DISALLOWED_SHOPIFY_TOOLS.has(name) || DISALLOWED_GA4_TOOLS.has(name)) {
      throw new Error(`Disallowed connector tool must not be imported: ${name}`);
    }
    if (!APPROVED_READ_TOOLS.has(name)) {
      throw new Error(`Unexpected MCP tool in import list: ${name}`);
    }
  }
}
