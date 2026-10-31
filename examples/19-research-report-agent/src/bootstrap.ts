import type {
  ConnectorResourceV1,
  ConnectorVersionResourceV1,
  DiscoverConnectorToolsResponseV1,
  ImportMcpToolsResponseV1,
  ModelProfileVersionId,
  ToolVersionId,
} from "@osva-ai/contracts";
import type { OsvaHttpClient } from "@osva-ai/sdk";

import type { DeployedTrustedAgent } from "./deploy-trusted.js";
import { buildRemoteHttpManifest, buildTrustedTypeScriptManifest } from "./runtime.js";

export const CONNECTOR_KEY = "examples-npm-research";

export interface ImportedNpmTools {
  readonly npmPackageMetadata: ToolVersionId;
  readonly npmDownloads: ToolVersionId;
  readonly connectorId: string;
  readonly connectorVersionId: string;
}

export async function ensureNpmConnectorAndTools(
  http: OsvaHttpClient,
  options: {
    readonly suffix: string;
    readonly connectorUrl: string;
    readonly useStdio?: { readonly command: string; readonly args: readonly string[] };
  },
): Promise<ImportedNpmTools> {
  const connector =
    (await findConnectorByKey(http, CONNECTOR_KEY)) ??
    (await http.request<ConnectorResourceV1>({
      method: "POST",
      path: "/v1/connectors",
      body: {
        key: CONNECTOR_KEY,
        name: "Examples npm Research Connector",
        description: "Read-only npm metadata connector for osva-examples/19-research-report-agent.",
      },
    }));

  const transport = options.useStdio ? ("STDIO" as const) : ("STREAMABLE_HTTP" as const);
  const transportConfig = options.useStdio ? options.useStdio : { endpointUrl: options.connectorUrl };

  const existingVersion = await findMatchingConnectorVersion(http, connector.id, transport, transportConfig);
  const connectorVersion =
    existingVersion ??
    (await http.request<ConnectorVersionResourceV1>({
      method: "POST",
      path: `/v1/connectors/${encodeURIComponent(connector.id)}/versions`,
      body: {
        kind: "MCP",
        transport,
        transportConfig,
      },
    }));

  const discovery = await http.request<DiscoverConnectorToolsResponseV1>({
    method: "POST",
    path:
      `/v1/connectors/${encodeURIComponent(connector.id)}/versions/` +
      `${encodeURIComponent(connectorVersion.id)}/discover`,
  });

  const metadataTool = discovery.tools.find((tool) => tool.remoteToolName === "npm_package_metadata");
  const downloadsTool = discovery.tools.find((tool) => tool.remoteToolName === "npm_downloads");
  if (metadataTool === undefined || downloadsTool === undefined) {
    throw new Error("MCP discovery did not return npm_package_metadata and npm_downloads.");
  }

  const imported = await http.request<ImportMcpToolsResponseV1>({
    method: "POST",
    path: "/v1/connectors/import-mcp-tools",
    body: {
      connectorVersionId: connectorVersion.id,
      tools: [
        {
          remoteToolName: metadataTool.remoteToolName,
          toolKey: `examples-npm-metadata-${options.suffix}`,
          toolName: `Examples npm metadata ${options.suffix}`,
        },
        {
          remoteToolName: downloadsTool.remoteToolName,
          toolKey: `examples-npm-downloads-${options.suffix}`,
          toolName: `Examples npm downloads ${options.suffix}`,
        },
      ],
    },
  });

  const metadataImported = imported.imported.find((item) => item.remoteToolName === "npm_package_metadata");
  const downloadsImported = imported.imported.find((item) => item.remoteToolName === "npm_downloads");
  if (metadataImported === undefined || downloadsImported === undefined) {
    throw new Error("OSVA did not import both npm MCP tools.");
  }

  return {
    connectorId: connector.id,
    connectorVersionId: connectorVersion.id,
    npmPackageMetadata: metadataImported.toolVersionId as ToolVersionId,
    npmDownloads: downloadsImported.toolVersionId as ToolVersionId,
  };
}

export function buildAgentManifestForRuntime(options: {
  readonly runtimeUrl?: string;
  readonly trusted?: DeployedTrustedAgent;
  readonly modelProfileVersionId: ModelProfileVersionId;
  readonly tools: ImportedNpmTools;
}) {
  const toolVersionIds = {
    npmPackageMetadata: options.tools.npmPackageMetadata,
    npmDownloads: options.tools.npmDownloads,
  };

  if (options.trusted !== undefined) {
    return buildTrustedTypeScriptManifest(
      options.trusted.entrypointPosix,
      options.trusted.integrity,
      options.modelProfileVersionId,
      toolVersionIds,
    );
  }

  if (options.runtimeUrl === undefined || options.runtimeUrl.trim().length === 0) {
    throw new Error("Either OSVA_AGENT_RUNTIME_URL or OSVA_TRUSTED_RUNTIME_ROOT deployment is required.");
  }

  return buildRemoteHttpManifest(options.runtimeUrl, options.modelProfileVersionId, toolVersionIds);
}

async function findConnectorByKey(http: OsvaHttpClient, key: string): Promise<ConnectorResourceV1 | undefined> {
  const list = await http.request<{ items: ConnectorResourceV1[] }>({ method: "GET", path: "/v1/connectors" });
  return list.items.find((item) => item.key === key);
}

async function findMatchingConnectorVersion(
  http: OsvaHttpClient,
  connectorId: string,
  transport: "STDIO" | "STREAMABLE_HTTP",
  transportConfig: Record<string, unknown> | { readonly command: string; readonly args: readonly string[] },
): Promise<ConnectorVersionResourceV1 | undefined> {
  const list = await http.request<{ items: ConnectorVersionResourceV1[] }>({
    method: "GET",
    path: `/v1/connectors/${encodeURIComponent(connectorId)}/versions`,
  });

  return list.items.find((version) => {
    if (version.transport !== transport) return false;
    return transportConfigMatches(version.transportConfig, transportConfig);
  });
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
