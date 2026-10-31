import type { NormalizedNpmDownloads, NormalizedNpmPackageMetadata } from "@osva-ai/connector-npm";
import { EVALUATION_FIXTURE_ARTIFACT_ID, FIXTURE_PACKAGE_NAME } from "./bindings.js";
import type { ResearchReportStructuredOutput } from "./agent-types.js";

export const FIXTURE_RESEARCH_TIMESTAMP = "2020-01-15T12:00:00.000Z";

export const FIXTURE_PACKAGE_METADATA: NormalizedNpmPackageMetadata = {
  name: FIXTURE_PACKAGE_NAME,
  latestVersion: "1.0.0-fixture",
  license: "MIT",
  repositoryUrl: "https://github.com/Osva-AI/osva-examples",
  modifiedAt: FIXTURE_RESEARCH_TIMESTAMP,
  maintainersCount: 1,
};

export const FIXTURE_DOWNLOADS: NormalizedNpmDownloads = {
  packageName: FIXTURE_PACKAGE_NAME,
  period: "last-month",
  downloads: 42,
  start: "2019-12-15",
  end: "2020-01-15",
};

export const FIXTURE_MODEL_SYNTHESIS = {
  findings: [
    "Fixture package is published under MIT license.",
    "Download volume is low in the fixture window (42 last-month downloads).",
  ],
  concerns: ["Fixture data only — not live registry telemetry."],
  assessment:
    "Informational fixture result suitable for deterministic evaluation; do not use for production decisions.",
  disposition: "informational" as const,
};

export function isFixturePackageName(packageName: string): boolean {
  return packageName.trim() === FIXTURE_PACKAGE_NAME;
}

export function buildDeterministicFixtureAgentOutput(): ResearchReportStructuredOutput {
  return {
    packageName: FIXTURE_PACKAGE_NAME,
    researchTimestamp: FIXTURE_RESEARCH_TIMESTAMP,
    disposition: FIXTURE_MODEL_SYNTHESIS.disposition,
    findingsCount: FIXTURE_MODEL_SYNTHESIS.findings.length,
    metadata: FIXTURE_PACKAGE_METADATA,
    downloads: FIXTURE_DOWNLOADS,
    synthesis: FIXTURE_MODEL_SYNTHESIS,
    sources: { npmRegistry: true, npmDownloads: true },
    report: {
      type: "artifact",
      artifactId: EVALUATION_FIXTURE_ARTIFACT_ID,
      name: `research-report-${FIXTURE_PACKAGE_NAME}.md`,
      mediaType: "text/markdown",
    },
  };
}
