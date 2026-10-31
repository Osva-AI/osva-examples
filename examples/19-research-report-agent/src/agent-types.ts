import type { JsonObject, JsonValue } from "@osva-ai/contracts";
import type { GenerateTextInput } from "@osva-ai/contracts";
import { isJsonRecord } from "@osva-examples/utils";

import type { NormalizedNpmDownloads, NormalizedNpmPackageMetadata } from "./connector/schemas.js";
import type { ResearchSynthesis } from "./report.js";

export interface ResearchReportInput {
  readonly packageName: string;
  readonly includeDownloads: boolean;
  readonly runKey: string;
}

export interface ResearchReportStructuredOutput {
  readonly packageName: string;
  readonly researchTimestamp: string;
  readonly disposition: ResearchSynthesis["disposition"];
  readonly findingsCount: number;
  readonly metadata: NormalizedNpmPackageMetadata;
  readonly downloads?: NormalizedNpmDownloads;
  readonly synthesis: ResearchSynthesis;
  readonly sources: { readonly npmRegistry: boolean; readonly npmDownloads: boolean };
  readonly report: {
    readonly type: "artifact";
    readonly artifactId: string;
    readonly name: string;
    readonly mediaType: string;
  };
}

export interface TrustedResearchReportContext {
  readonly input: JsonValue;
  readonly models: {
    generateText(binding: string, request: GenerateTextInput): Promise<{ text: string }>;
  };
  readonly tools: {
    invoke(binding: string, input: unknown, options?: { readonly idempotencyKey?: string }): Promise<unknown>;
  };
  readonly artifacts: {
    create(
      name: string,
      content: ReadableStream<Uint8Array> | Blob,
      options?: {
        readonly mediaType?: string;
        readonly metadata?: JsonObject;
        readonly idempotencyKey?: string;
      },
    ): Promise<{
      readonly reference: { readonly type: "artifact"; readonly artifactId: string };
      readonly name: string;
      readonly mediaType: string;
    }>;
  };
}

export function parseResearchReportInput(input: JsonValue): ResearchReportInput {
  if (!isJsonRecord(input)) {
    throw new Error("Run input must be an object with 'packageName'.");
  }
  const packageName = input["packageName"];
  if (typeof packageName !== "string" || packageName.trim().length === 0) {
    throw new Error("Run input must include a non-empty string 'packageName'.");
  }
  const includeDownloadsRaw = input["includeDownloads"];
  const includeDownloads =
    includeDownloadsRaw === undefined
      ? true
      : typeof includeDownloadsRaw === "boolean"
        ? includeDownloadsRaw
        : (() => {
            throw new Error("Optional 'includeDownloads' must be a boolean when provided.");
          })();

  const runKeyRaw = input["runKey"];
  const runKey = typeof runKeyRaw === "string" && runKeyRaw.trim().length > 0 ? runKeyRaw.trim() : packageName.trim();

  return { packageName: packageName.trim(), includeDownloads, runKey };
}

export function parseResearchSynthesis(modelText: string): ResearchSynthesis {
  const trimmed = modelText.trim();
  if (trimmed.length === 0) {
    throw new Error("Model returned empty synthesis text.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error("Model synthesis was not valid JSON.");
  }

  if (!isJsonRecord(parsed as JsonValue)) {
    throw new Error("Model synthesis JSON must be an object.");
  }

  const record = parsed as JsonObject;
  const findings = record["findings"];
  const concerns = record["concerns"];
  const assessment = record["assessment"];
  const disposition = record["disposition"];

  if (!Array.isArray(findings) || findings.some((item) => typeof item !== "string")) {
    throw new Error("Model synthesis must include string[] 'findings'.");
  }
  if (!Array.isArray(concerns) || concerns.some((item) => typeof item !== "string")) {
    throw new Error("Model synthesis must include string[] 'concerns'.");
  }
  if (typeof assessment !== "string" || assessment.trim().length === 0) {
    throw new Error("Model synthesis must include non-empty string 'assessment'.");
  }
  if (disposition !== "informational" && disposition !== "caution" && disposition !== "critical") {
    throw new Error("Model synthesis disposition must be informational, caution, or critical.");
  }

  return {
    findings: findings.map((item) => item.trim()).filter((item) => item.length > 0),
    concerns: concerns.map((item) => item.trim()).filter((item) => item.length > 0),
    assessment: assessment.trim(),
    disposition,
  };
}

export function toEvaluationSummary(output: ResearchReportStructuredOutput): JsonObject {
  return {
    packageName: output.packageName,
    researchTimestamp: output.researchTimestamp,
    disposition: output.disposition,
    findingsCount: output.findingsCount,
    sources: output.sources,
    report: {
      type: output.report.type,
      name: output.report.name,
      mediaType: output.report.mediaType,
    },
  };
}
