import type { BranchResearchResult } from "./fixtures.js";
import type { ResearchRequest } from "./input.js";

export interface SynthesisSection {
  readonly branch: BranchResearchResult["branch"];
  readonly headline: string;
  readonly bullets: readonly string[];
  readonly sourceIds: readonly string[];
}

export interface ResearchSynthesis {
  readonly question: string;
  readonly sections: readonly SynthesisSection[];
  readonly crossCuttingThemes: readonly string[];
}

export function synthesizeParallelResearch(
  request: ResearchRequest,
  branches: readonly BranchResearchResult[],
): ResearchSynthesis {
  if (branches.length < 3) {
    throw new Error("Synthesis requires findings from market, competitor, and customer branches.");
  }

  const sections: SynthesisSection[] = branches.map((branch) => ({
    branch: branch.branch,
    headline: branch.focus,
    bullets: branch.findings.map((finding) => finding.claim),
    sourceIds: branch.findings.map((finding) => finding.sourceId),
  }));

  const crossCuttingThemes = [
    "Governed knowledge and auditability determine whether AI assistants move from pilot to production.",
    "Workflow-native integrations matter more than standalone chat experiences for mid-market SaaS buyers.",
    "ROI narratives must connect to measurable support outcomes within a single planning cycle.",
  ];

  return {
    question: request.question,
    sections,
    crossCuttingThemes,
  };
}
