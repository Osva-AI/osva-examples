import type { ToolVersionId } from "@osva-ai/contracts";
import type { OsvaClient } from "@osva-ai/sdk";

import {
  TOOL_BINDING_GA4_PROPERTY_GET,
  TOOL_BINDING_GA4_REPORT_ACQUISITION,
  TOOL_BINDING_GA4_REPORT_ECOMMERCE,
  TOOL_BINDING_SHOPIFY_ORDER_LIST,
  TOOL_BINDING_SHOPIFY_PRODUCT_LIST,
  TOOL_BINDING_SHOPIFY_SHOP_GET,
} from "./bindings.js";
import {
  assertGa4ReadOnlyDiscovery,
  assertImportedToolsAreReadOnly,
  assertShopifyReadOnlyDiscovery,
} from "./connector/read-only-tools.js";
import type { DeployedTrustedAgent } from "./deploy-trusted.js";
import { buildRemoteHttpManifest, buildTrustedTypeScriptManifest } from "./runtime.js";

export const SHOPIFY_CONNECTOR_KEY = "examples-commerce-growth-shopify";
export const GA4_CONNECTOR_KEY = "examples-commerce-growth-ga4";

export interface ImportedCommerceGrowthTools {
  readonly shopifyShopGet: ToolVersionId;
  readonly shopifyProductList: ToolVersionId;
  readonly shopifyOrderList: ToolVersionId;
  readonly ga4PropertyGet: ToolVersionId;
  readonly ga4ReportAcquisition: ToolVersionId;
  readonly ga4ReportEcommerce: ToolVersionId;
  readonly shopifyConnectorId: string;
  readonly shopifyConnectorVersionId: string;
  readonly ga4ConnectorId: string;
  readonly ga4ConnectorVersionId: string;
}

export async function ensureCommerceGrowthConnectorsAndTools(
  client: OsvaClient,
  options: {
    readonly suffix: string;
    readonly shopifyStdio: { readonly command: string; readonly args: readonly string[] };
    readonly ga4Stdio: { readonly command: string; readonly args: readonly string[] };
  },
): Promise<ImportedCommerceGrowthTools> {
  const shopify = await ensureConnectorTools(client, {
    connectorKey: SHOPIFY_CONNECTOR_KEY,
    connectorName: "Examples Commerce Growth Shopify Connector",
    connectorDescription:
      "Read-only Shopify MCP via @osva-ai/connector-shopify for osva-examples/21-commerce-growth-analyst.",
    suffix: options.suffix,
    transportConfig: options.shopifyStdio,
    remoteTools: [TOOL_BINDING_SHOPIFY_SHOP_GET, TOOL_BINDING_SHOPIFY_PRODUCT_LIST, TOOL_BINDING_SHOPIFY_ORDER_LIST],
    toolKeyPrefix: "examples-shopify",
  });

  const ga4 = await ensureConnectorTools(client, {
    connectorKey: GA4_CONNECTOR_KEY,
    connectorName: "Examples Commerce Growth GA4 Connector",
    connectorDescription: "Read-only GA4 MCP via @osva-ai/connector-ga4 for osva-examples/21-commerce-growth-analyst.",
    suffix: options.suffix,
    transportConfig: options.ga4Stdio,
    remoteTools: [
      TOOL_BINDING_GA4_PROPERTY_GET,
      TOOL_BINDING_GA4_REPORT_ACQUISITION,
      TOOL_BINDING_GA4_REPORT_ECOMMERCE,
    ],
    toolKeyPrefix: "examples-ga4",
  });

  return {
    shopifyConnectorId: shopify.connectorId,
    shopifyConnectorVersionId: shopify.connectorVersionId,
    ga4ConnectorId: ga4.connectorId,
    ga4ConnectorVersionId: ga4.connectorVersionId,
    shopifyShopGet: shopify.toolVersionIds[TOOL_BINDING_SHOPIFY_SHOP_GET] as ToolVersionId,
    shopifyProductList: shopify.toolVersionIds[TOOL_BINDING_SHOPIFY_PRODUCT_LIST] as ToolVersionId,
    shopifyOrderList: shopify.toolVersionIds[TOOL_BINDING_SHOPIFY_ORDER_LIST] as ToolVersionId,
    ga4PropertyGet: ga4.toolVersionIds[TOOL_BINDING_GA4_PROPERTY_GET] as ToolVersionId,
    ga4ReportAcquisition: ga4.toolVersionIds[TOOL_BINDING_GA4_REPORT_ACQUISITION] as ToolVersionId,
    ga4ReportEcommerce: ga4.toolVersionIds[TOOL_BINDING_GA4_REPORT_ECOMMERCE] as ToolVersionId,
  };
}

async function ensureConnectorTools(
  client: OsvaClient,
  options: {
    readonly connectorKey: string;
    readonly connectorName: string;
    readonly connectorDescription: string;
    readonly suffix: string;
    readonly transportConfig: { readonly command: string; readonly args: readonly string[] };
    readonly remoteTools: readonly string[];
    readonly toolKeyPrefix: string;
  },
): Promise<{
  readonly connectorId: string;
  readonly connectorVersionId: string;
  readonly toolVersionIds: Record<string, ToolVersionId>;
}> {
  const list = await client.connectors.list();
  const connector =
    list.connectors.find((item) => item.key === options.connectorKey) ??
    (await client.connectors.create({
      key: options.connectorKey,
      name: options.connectorName,
      description: options.connectorDescription,
    }));

  const transport = "STDIO" as const;
  const transportConfig = options.transportConfig;

  const versions = await client.connectors.listVersions(connector.id);
  const connectorVersion =
    versions.versions.find(
      (version) => version.transport === transport && transportConfigMatches(version.transportConfig, transportConfig),
    ) ??
    (await client.connectors.createVersion(connector.id, {
      kind: "MCP",
      transport,
      transportConfig: { command: transportConfig.command, args: [...transportConfig.args] },
    }));

  const discovery = await client.connectors.discover(connector.id, connectorVersion.id);
  const remoteNames = discovery.tools.map((tool) => tool.remoteToolName);
  if (options.connectorKey === SHOPIFY_CONNECTOR_KEY) {
    assertShopifyReadOnlyDiscovery(remoteNames);
  } else if (options.connectorKey === GA4_CONNECTOR_KEY) {
    assertGa4ReadOnlyDiscovery(remoteNames);
  }

  const importSpecs = options.remoteTools.map((remoteToolName) => {
    const discovered = discovery.tools.find((tool) => tool.remoteToolName === remoteToolName);
    if (discovered === undefined) {
      throw new Error(`MCP discovery did not return ${remoteToolName}.`);
    }
    const shortKey = remoteToolName.replace(/\./g, "-");
    return {
      remoteToolName,
      toolKey: `${options.toolKeyPrefix}-${shortKey}-${options.suffix}`,
      toolName: `Examples ${remoteToolName} ${options.suffix}`,
    };
  });

  assertImportedToolsAreReadOnly(importSpecs.map((spec) => spec.remoteToolName));

  const imported = await client.connectors.importMcpTools({
    connectorVersionId: connectorVersion.id,
    tools: importSpecs,
  });

  const toolVersionIds: Record<string, ToolVersionId> = {};
  for (const remoteToolName of options.remoteTools) {
    const match = imported.imported.find((item) => item.remoteToolName === remoteToolName);
    if (match === undefined) {
      throw new Error(`OSVA did not import ${remoteToolName}.`);
    }
    toolVersionIds[remoteToolName] = match.toolVersionId as ToolVersionId;
  }

  return { connectorId: connector.id, connectorVersionId: connectorVersion.id, toolVersionIds };
}

export function buildAgentManifestForRuntime(options: {
  readonly runtimeUrl?: string;
  readonly trusted?: DeployedTrustedAgent;
  readonly tools: ImportedCommerceGrowthTools;
}) {
  const toolVersionIds = {
    shopifyShopGet: options.tools.shopifyShopGet,
    shopifyProductList: options.tools.shopifyProductList,
    shopifyOrderList: options.tools.shopifyOrderList,
    ga4PropertyGet: options.tools.ga4PropertyGet,
    ga4ReportAcquisition: options.tools.ga4ReportAcquisition,
    ga4ReportEcommerce: options.tools.ga4ReportEcommerce,
  };

  if (options.trusted !== undefined) {
    return buildTrustedTypeScriptManifest(options.trusted.entrypointPosix, options.trusted.integrity, toolVersionIds);
  }

  if (options.runtimeUrl === undefined || options.runtimeUrl.trim().length === 0) {
    throw new Error("Either OSVA_AGENT_RUNTIME_URL or OSVA_TRUSTED_RUNTIME_ROOT deployment is required.");
  }

  return buildRemoteHttpManifest(options.runtimeUrl, toolVersionIds);
}

export function transportConfigMatches(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const out: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      out[key] = sortJson(record[key]);
    }
    return out;
  }
  return value;
}
