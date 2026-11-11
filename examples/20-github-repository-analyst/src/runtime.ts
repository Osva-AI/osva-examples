import type { JsonObject, JsonValue, ToolVersionId } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";

import { runRepositoryAnalystAgent } from "./agent.js";
import type { TrustedRepositoryAnalystContext } from "./agent-types.js";
import { TOOL_BINDING_ISSUE_GET, TOOL_BINDING_ISSUE_LIST, TOOL_BINDING_REPOSITORY_GET } from "./bindings.js";

export const repositoryAnalystRuntime = createRuntime({
  execute: async (input, context) => {
    const adapted: TrustedRepositoryAnalystContext = {
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

    const output = await runRepositoryAnalystAgent(adapted);
    return output as unknown as JsonObject;
  },
});

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    owner: { type: "string", minLength: 1 },
    repo: { type: "string", minLength: 1 },
    maxIssueSampleSize: { type: "integer", minimum: 1, maximum: 50 },
    issueState: { type: "string", enum: ["open", "closed", "all"] },
    issuePageLimit: { type: "integer", minimum: 1, maximum: 100 },
    runKey: { type: "string", minLength: 1 },
  },
  required: ["owner", "repo", "maxIssueSampleSize"],
  additionalProperties: false,
} as const;

function buildManifestBase(toolVersionIds: {
  readonly repositoryGet: ToolVersionId;
  readonly issueList: ToolVersionId;
  readonly issueGet: ToolVersionId;
}) {
  return {
    schemaVersion: "1" as const,
    key: "github-repository-analyst",
    name: "GitHub Repository Analyst",
    input: { schema: INPUT_SCHEMA },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 120_000, maxAttempts: 1 },
    capabilities: {
      model: false,
      tools: [TOOL_BINDING_REPOSITORY_GET, TOOL_BINDING_ISSUE_LIST, TOOL_BINDING_ISSUE_GET],
    },
    tools: {
      [TOOL_BINDING_REPOSITORY_GET]: { toolVersionId: toolVersionIds.repositoryGet },
      [TOOL_BINDING_ISSUE_LIST]: { toolVersionId: toolVersionIds.issueList },
      [TOOL_BINDING_ISSUE_GET]: { toolVersionId: toolVersionIds.issueGet },
    },
  };
}

export function buildRemoteHttpManifest(
  runtimeUrl: string,
  toolVersionIds: {
    readonly repositoryGet: ToolVersionId;
    readonly issueList: ToolVersionId;
    readonly issueGet: ToolVersionId;
  },
) {
  return {
    ...buildManifestBase(toolVersionIds),
    runtime: {
      type: "REMOTE_HTTP" as const,
      protocolVersion: "1" as const,
      endpoint: runtimeUrl,
      timeoutMs: 120_000,
    },
  };
}

export function buildTrustedTypeScriptManifest(
  entrypoint: string,
  integrity: string,
  toolVersionIds: {
    readonly repositoryGet: ToolVersionId;
    readonly issueList: ToolVersionId;
    readonly issueGet: ToolVersionId;
  },
) {
  return {
    ...buildManifestBase(toolVersionIds),
    runtime: {
      type: "TRUSTED_TYPESCRIPT" as const,
      entrypoint,
      integrity,
    },
  };
}
