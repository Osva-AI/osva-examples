import type { ToolVersionId } from "@osva-ai/contracts";
import type { OsvaClient } from "@osva-ai/sdk";

import type { DeployedTrustedAgent } from "./deploy-trusted.js";
import {
  READ_ONLY_GITHUB_REMOTE_TOOLS,
  TOOL_BINDING_ISSUE_GET,
  TOOL_BINDING_ISSUE_LIST,
  TOOL_BINDING_REPOSITORY_GET,
} from "./bindings.js";
import { assertImportedToolsAreReadOnly, selectReadOnlyToolsForImport } from "./connector/read-only-tools.js";
import { buildRemoteHttpManifest, buildTrustedTypeScriptManifest } from "./runtime.js";

export const CONNECTOR_KEY = "examples-github-repository-analyst";

export interface ImportedGithubReadTools {
  readonly repositoryGet: ToolVersionId;
  readonly issueList: ToolVersionId;
  readonly issueGet: ToolVersionId;
  readonly connectorId: string;
  readonly connectorVersionId: string;
}

export async function ensureGithubConnectorAndTools(
  client: OsvaClient,
  options: {
    readonly suffix: string;
    readonly useStdio: { readonly command: string; readonly args: readonly string[] };
  },
): Promise<ImportedGithubReadTools> {
  const list = await client.connectors.list();
  const connector =
    list.connectors.find((item) => item.key === CONNECTOR_KEY) ??
    (await client.connectors.create({
      key: CONNECTOR_KEY,
      name: "Examples GitHub Repository Analyst Connector",
      description: "Read-only GitHub MCP via @osva-ai/connector-github for osva-examples/20-github-repository-analyst.",
    }));

  const transport = "STDIO" as const;
  const transportConfig = options.useStdio;

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
  selectReadOnlyToolsForImport(remoteNames);

  const importSpecs = READ_ONLY_GITHUB_REMOTE_TOOLS.map((remoteToolName) => {
    const discovered = discovery.tools.find((tool) => tool.remoteToolName === remoteToolName);
    if (discovered === undefined) {
      throw new Error(`MCP discovery did not return ${remoteToolName}.`);
    }
    const shortKey = remoteToolName.replace(/\./g, "-");
    return {
      remoteToolName,
      toolKey: `examples-github-${shortKey}-${options.suffix}`,
      toolName: `Examples GitHub ${remoteToolName} ${options.suffix}`,
    };
  });

  assertImportedToolsAreReadOnly(importSpecs.map((spec) => spec.remoteToolName));

  const imported = await client.connectors.importMcpTools({
    connectorVersionId: connectorVersion.id,
    tools: importSpecs,
  });

  const repositoryImported = imported.imported.find((item) => item.remoteToolName === TOOL_BINDING_REPOSITORY_GET);
  const issueListImported = imported.imported.find((item) => item.remoteToolName === TOOL_BINDING_ISSUE_LIST);
  const issueGetImported = imported.imported.find((item) => item.remoteToolName === TOOL_BINDING_ISSUE_GET);

  if (repositoryImported === undefined || issueListImported === undefined || issueGetImported === undefined) {
    throw new Error("OSVA did not import all three read-only GitHub MCP tools.");
  }

  return {
    connectorId: connector.id,
    connectorVersionId: connectorVersion.id,
    repositoryGet: repositoryImported.toolVersionId as ToolVersionId,
    issueList: issueListImported.toolVersionId as ToolVersionId,
    issueGet: issueGetImported.toolVersionId as ToolVersionId,
  };
}

export function buildAgentManifestForRuntime(options: {
  readonly runtimeUrl?: string;
  readonly trusted?: DeployedTrustedAgent;
  readonly tools: ImportedGithubReadTools;
}) {
  const toolVersionIds = {
    repositoryGet: options.tools.repositoryGet,
    issueList: options.tools.issueList,
    issueGet: options.tools.issueGet,
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
