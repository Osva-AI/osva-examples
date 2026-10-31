import type { JsonObject, JsonValue, ModelProfileVersionId, ToolVersionId } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";

import { runResearchReportAgent } from "./agent.js";
import type { TrustedResearchReportContext } from "./agent-types.js";
import { MODEL_BINDING_RESEARCH, TOOL_BINDING_NPM_DOWNLOADS, TOOL_BINDING_NPM_PACKAGE_METADATA } from "./bindings.js";

export const researchReportRuntime = createRuntime({
  execute: async (input, context) => {
    const adapted: TrustedResearchReportContext = {
      input,
      models: {
        generateText: (binding, request) =>
          context.models.generateText({
            binding,
            messages: request.messages,
            ...(request.maxOutputTokens === undefined ? {} : { maxOutputTokens: request.maxOutputTokens }),
          }),
      },
      tools: {
        invoke: (binding, toolInput, options) =>
          context.tools.invoke({
            binding,
            input: toolInput as JsonValue,
            ...(options?.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
          }),
      },
      artifacts: {
        create: async (name, content, options) =>
          context.artifacts.create({
            name,
            content: content instanceof Blob ? content : await blobFromStream(content),
            ...(options?.mediaType === undefined ? {} : { mediaType: options.mediaType }),
            ...(options?.metadata === undefined ? {} : { metadata: options.metadata }),
            ...(options?.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
          }),
      },
    };

    const output = await runResearchReportAgent(adapted);
    return output as unknown as JsonObject;
  },
});

async function blobFromStream(stream: ReadableStream<Uint8Array>): Promise<Blob> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) chunks.push(value);
  }
  return new Blob(chunks as BlobPart[], { type: "text/markdown" });
}

export function buildRemoteHttpManifest(
  runtimeUrl: string,
  modelProfileVersionId: ModelProfileVersionId,
  toolVersionIds: {
    readonly npmPackageMetadata: ToolVersionId;
    readonly npmDownloads: ToolVersionId;
  },
) {
  return {
    schemaVersion: "1" as const,
    key: "research-report-agent",
    name: "Research & Report Agent",
    runtime: {
      type: "REMOTE_HTTP" as const,
      protocolVersion: "1" as const,
      endpoint: runtimeUrl,
      timeoutMs: 120_000,
    },
    input: {
      schema: {
        type: "object",
        properties: {
          packageName: { type: "string", minLength: 1 },
          includeDownloads: { type: "boolean" },
          runKey: { type: "string", minLength: 1 },
        },
        required: ["packageName"],
        additionalProperties: false,
      },
    },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 120_000, maxAttempts: 1 },
    capabilities: {
      model: true,
      tools: [TOOL_BINDING_NPM_PACKAGE_METADATA, TOOL_BINDING_NPM_DOWNLOADS],
    },
    models: { [MODEL_BINDING_RESEARCH]: { modelProfileVersionId } },
    tools: {
      [TOOL_BINDING_NPM_PACKAGE_METADATA]: { toolVersionId: toolVersionIds.npmPackageMetadata },
      [TOOL_BINDING_NPM_DOWNLOADS]: { toolVersionId: toolVersionIds.npmDownloads },
    },
  };
}

export function buildTrustedTypeScriptManifest(
  entrypoint: string,
  integrity: string,
  modelProfileVersionId: ModelProfileVersionId,
  toolVersionIds: {
    readonly npmPackageMetadata: ToolVersionId;
    readonly npmDownloads: ToolVersionId;
  },
) {
  return {
    schemaVersion: "1" as const,
    key: "research-report-agent",
    name: "Research & Report Agent",
    runtime: {
      type: "TRUSTED_TYPESCRIPT" as const,
      entrypoint,
      integrity,
    },
    input: {
      schema: {
        type: "object",
        properties: {
          packageName: { type: "string", minLength: 1 },
          includeDownloads: { type: "boolean" },
          runKey: { type: "string", minLength: 1 },
        },
        required: ["packageName"],
        additionalProperties: false,
      },
    },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 120_000, maxAttempts: 1 },
    capabilities: {
      model: true,
      tools: [TOOL_BINDING_NPM_PACKAGE_METADATA, TOOL_BINDING_NPM_DOWNLOADS],
    },
    models: { [MODEL_BINDING_RESEARCH]: { modelProfileVersionId } },
    tools: {
      [TOOL_BINDING_NPM_PACKAGE_METADATA]: { toolVersionId: toolVersionIds.npmPackageMetadata },
      [TOOL_BINDING_NPM_DOWNLOADS]: { toolVersionId: toolVersionIds.npmDownloads },
    },
  };
}
