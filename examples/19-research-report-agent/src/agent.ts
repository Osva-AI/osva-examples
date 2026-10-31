import type { JsonObject } from "@osva-ai/contracts";

import {
  EVALUATION_FIXTURE_RUN_KEY,
  MODEL_BINDING_RESEARCH,
  TOOL_BINDING_NPM_DOWNLOADS,
  TOOL_BINDING_NPM_PACKAGE_METADATA,
  reportArtifactIdempotencyKey,
  toolIdempotencyKey,
} from "./bindings.js";
import type { NormalizedNpmDownloads, NormalizedNpmPackageMetadata } from "@osva-ai/connector-npm";
import {
  FIXTURE_DOWNLOADS,
  FIXTURE_MODEL_SYNTHESIS,
  FIXTURE_PACKAGE_METADATA,
  FIXTURE_RESEARCH_TIMESTAMP,
  buildDeterministicFixtureAgentOutput,
  isFixturePackageName,
} from "./fixtures.js";
import { buildResearchSynthesisMessages } from "./prompts.js";
import { renderResearchReportMarkdown, sanitizePackageNameForFilename, type ResearchSynthesis } from "./report.js";
import {
  parseResearchReportInput,
  parseResearchSynthesis,
  type ResearchReportStructuredOutput,
  type TrustedResearchReportContext,
} from "./agent-types.js";

export async function runResearchReportAgent(
  context: TrustedResearchReportContext,
): Promise<ResearchReportStructuredOutput> {
  const request = parseResearchReportInput(context.input);
  if (isFixturePackageName(request.packageName) && request.runKey === EVALUATION_FIXTURE_RUN_KEY) {
    return buildDeterministicFixtureAgentOutput();
  }

  const researchTimestamp = isFixturePackageName(request.packageName)
    ? FIXTURE_RESEARCH_TIMESTAMP
    : new Date().toISOString();

  let metadata: NormalizedNpmPackageMetadata;
  let downloads: NormalizedNpmDownloads | undefined;
  let synthesis: ResearchSynthesis;

  if (isFixturePackageName(request.packageName)) {
    metadata = FIXTURE_PACKAGE_METADATA;
    downloads = request.includeDownloads ? FIXTURE_DOWNLOADS : undefined;
    synthesis = FIXTURE_MODEL_SYNTHESIS;
  } else {
    const metadataRaw = await context.tools.invoke(
      TOOL_BINDING_NPM_PACKAGE_METADATA,
      { packageName: request.packageName },
      { idempotencyKey: toolIdempotencyKey(request.runKey, "npm_package_metadata") },
    );
    metadata = metadataRaw as NormalizedNpmPackageMetadata;

    if (request.includeDownloads) {
      const downloadsRaw = await context.tools.invoke(
        TOOL_BINDING_NPM_DOWNLOADS,
        { packageName: request.packageName, period: "last-month" },
        { idempotencyKey: toolIdempotencyKey(request.runKey, "npm_downloads") },
      );
      downloads = downloadsRaw as NormalizedNpmDownloads;
    }

    const generated = await context.models.generateText(MODEL_BINDING_RESEARCH, {
      messages: buildResearchSynthesisMessages({
        packageName: request.packageName,
        metadata,
        ...(downloads === undefined ? {} : { downloads }),
      }),
      maxOutputTokens: 2_048,
    });
    synthesis = parseResearchSynthesis(generated.text);
  }

  const sources = {
    npmRegistry: true,
    npmDownloads: downloads !== undefined,
  };

  const markdown = renderResearchReportMarkdown({
    packageName: request.packageName,
    researchTimestamp,
    metadata,
    ...(downloads === undefined ? {} : { downloads }),
    synthesis,
    sources,
  });

  const safeName = sanitizePackageNameForFilename(request.packageName);
  const artifactName = `research-report-${safeName}.md`;
  const artifact = await context.artifacts.create(artifactName, new Blob([markdown], { type: "text/markdown" }), {
    mediaType: "text/markdown",
    metadata: {
      example: "19-research-report-agent",
      packageName: request.packageName,
      disposition: synthesis.disposition,
    } satisfies JsonObject,
    idempotencyKey: reportArtifactIdempotencyKey(request.runKey, request.packageName),
  });

  return {
    packageName: request.packageName,
    researchTimestamp,
    disposition: synthesis.disposition,
    findingsCount: synthesis.findings.length,
    metadata,
    ...(downloads === undefined ? {} : { downloads }),
    synthesis,
    sources,
    report: {
      type: "artifact",
      artifactId: artifact.reference.artifactId,
      name: artifact.name,
      mediaType: artifact.mediaType,
    },
  };
}
