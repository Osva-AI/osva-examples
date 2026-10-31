import type { NormalizedNpmDownloads, NormalizedNpmPackageMetadata } from "@osva-ai/connector-npm";

export interface ResearchSynthesis {
  readonly findings: readonly string[];
  readonly concerns: readonly string[];
  readonly assessment: string;
  readonly disposition: "informational" | "caution" | "critical";
}

export interface ReportSourceAttribution {
  readonly npmRegistry: boolean;
  readonly npmDownloads: boolean;
}

export function renderResearchReportMarkdown(options: {
  readonly packageName: string;
  readonly researchTimestamp: string;
  readonly metadata: NormalizedNpmPackageMetadata;
  readonly downloads?: NormalizedNpmDownloads;
  readonly synthesis: ResearchSynthesis;
  readonly sources: ReportSourceAttribution;
}): string {
  const lines: string[] = [
    `# npm research report: ${options.packageName}`,
    "",
    `- **Researched at:** ${options.researchTimestamp}`,
    `- **Latest version:** ${options.metadata.latestVersion}`,
  ];

  if (options.metadata.license !== undefined) {
    lines.push(`- **License:** ${options.metadata.license}`);
  }
  if (options.metadata.repositoryUrl !== undefined) {
    lines.push(`- **Repository:** ${options.metadata.repositoryUrl}`);
  }
  if (options.metadata.modifiedAt !== undefined) {
    lines.push(`- **Registry modified:** ${options.metadata.modifiedAt}`);
  }
  if (options.metadata.deprecated !== undefined) {
    lines.push(`- **Deprecation notice:** ${options.metadata.deprecated}`);
  }
  if (options.downloads !== undefined) {
    lines.push(`- **Downloads (${options.downloads.period}):** ${options.downloads.downloads.toLocaleString("en-US")}`);
    lines.push(`  - Window: ${options.downloads.start} → ${options.downloads.end}`);
  }

  lines.push("", "## Key findings", "");
  for (const finding of options.synthesis.findings) {
    lines.push(`- ${finding}`);
  }

  lines.push("", "## Potential concerns", "");
  if (options.synthesis.concerns.length === 0) {
    lines.push("- None identified from available metadata.");
  } else {
    for (const concern of options.synthesis.concerns) {
      lines.push(`- ${concern}`);
    }
  }

  lines.push("", "## Sources", "");
  lines.push(`- npm registry metadata: ${options.sources.npmRegistry ? "yes" : "no"}`);
  lines.push(`- npm download metrics: ${options.sources.npmDownloads ? "yes" : "no"}`);

  lines.push("", "## Overall assessment", "", options.synthesis.assessment.trim(), "");
  return lines.join("\n");
}

export function sanitizePackageNameForFilename(packageName: string): string {
  return packageName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "package";
}
