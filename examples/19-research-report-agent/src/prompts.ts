import type { NormalizedNpmDownloads, NormalizedNpmPackageMetadata } from "./connector/schemas.js";

export const RESEARCH_MODEL_SYSTEM_PROMPT =
  "You are an open-source package research analyst. Using only the provided npm metadata JSON, " +
  "produce a concise research synthesis. Reply with JSON only using this shape:\n" +
  '{"findings":["..."],"concerns":["..."],"assessment":"...","disposition":"informational|caution|critical"}\n' +
  "Do not invent versions, licenses, or download numbers not present in the input.";

export function buildResearchSynthesisMessages(options: {
  readonly packageName: string;
  readonly metadata: NormalizedNpmPackageMetadata;
  readonly downloads?: NormalizedNpmDownloads;
}) {
  const evidence = {
    packageName: options.packageName,
    metadata: options.metadata,
    ...(options.downloads === undefined ? {} : { downloads: options.downloads }),
  };

  return [
    { role: "system" as const, content: RESEARCH_MODEL_SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Analyze this npm evidence and return JSON only:\n${JSON.stringify(evidence, null, 2)}`,
    },
  ];
}
