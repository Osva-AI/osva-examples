import type { ModelProfileVersionId, ToolVersionId } from "@osva-ai/contracts";
import type { OsvaClient } from "@osva-ai/sdk";

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
  client: OsvaClient,
  options: {
    readonly suffix: string;
    readonly connectorUrl: string;
    readonly useStdio?: { readonly command: string; readonly args: readonly string[] };
  },
): Promise<ImportedNpmTools> {
  const list = await client.connectors.list();
  const connector =
    list.connectors.find((item) => item.key === CONNECTOR_KEY) ??
    (await client.connectors.create({
      key: CONNECTOR_KEY,
      name: "Examples npm Research Connector",
      description: "Read-only npm metadata via @osva-ai/connector-npm for osva-examples/19-research-report-agent.",
    }));

  const transport = options.useStdio ? ("STDIO" as const) : ("STREAMABLE_HTTP" as const);
  const transportConfig = options.useStdio ? options.useStdio : { endpointUrl: options.connectorUrl };

  const versions = await client.connectors.listVersions(connector.id);
  const connectorVersion =
    versions.versions.find((version) => {
      if (version.transport !== transport) return false;
      return transportConfigMatches(version.transportConfig, transportConfig);
    }) ??
    (await client.connectors.createVersion(connector.id, {
      kind: "MCP",
      transport,
      transportConfig: toMutableTransportConfig(transportConfig),
    }));

  const discovery = await client.connectors.discover(connector.id, connectorVersion.id);

  const metadataTool = discovery.tools.find((tool) => tool.remoteToolName === "npm_package_metadata");
  const downloadsTool = discovery.tools.find((tool) => tool.remoteToolName === "npm_downloads");
  if (metadataTool === undefined || downloadsTool === undefined) {
    throw new Error("MCP discovery did not return npm_package_metadata and npm_downloads.");
  }

  const imported = await client.connectors.importMcpTools({
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

export function transportConfigMatches(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function toMutableTransportConfig(
  transportConfig: { readonly endpointUrl: string } | { readonly command: string; readonly args: readonly string[] },
): { endpointUrl: string } | { command: string; args: string[] } {
  if ("endpointUrl" in transportConfig) {
    return { endpointUrl: transportConfig.endpointUrl };
  }
  return { command: transportConfig.command, args: [...transportConfig.args] };
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
