export interface ResearchWorkerInput {
  readonly question: string;
  readonly objective?: string;
  readonly audience?: string;
}

export interface ResearchWorkerRequest extends ResearchWorkerInput {
  readonly researchId: string;
}

export interface ResearchPlan {
  readonly researchQuestion: string;
  readonly subQuestions: readonly string[];
  readonly evidenceNeeded: readonly string[];
}

export interface SourceSnippet {
  readonly claim: string;
  readonly theme: string;
  readonly strength: EvidenceStrength;
  readonly stance: EvidenceStance;
}

export interface ResearchSource {
  readonly id: string;
  readonly title: string;
  readonly publisher: string;
  readonly publishedAt?: string;
  readonly url?: string;
  readonly content: string;
  readonly snippets: readonly SourceSnippet[];
}

export type EvidenceStrength = "strong" | "moderate" | "weak";
export type EvidenceStance = "support" | "caution" | "neutral";

export interface EvidenceRecord {
  readonly id: string;
  readonly sourceId: string;
  readonly claim: string;
  readonly theme: string;
  readonly strength: EvidenceStrength;
  readonly supports?: string;
  readonly contradicts?: string;
}

export type ThemeConfidence = "high" | "medium" | "low";

export interface ThemeFinding {
  readonly name: string;
  readonly finding: string;
  readonly supportingEvidenceIds: readonly string[];
  readonly confidence: ThemeConfidence;
  readonly caveats: readonly string[];
}

export interface ResearchAnalysis {
  readonly themes: readonly ThemeFinding[];
}

export type ReviewIssueType = "unsupported" | "conflict" | "weak-evidence" | "coverage-gap";

export interface ReviewIssue {
  readonly type: ReviewIssueType;
  readonly description: string;
  readonly relatedEvidenceIds?: readonly string[];
  readonly relatedTheme?: string;
}

export interface EvidenceReview {
  readonly issues: readonly ReviewIssue[];
  readonly summary: string;
}

export interface ResearchReportMeta {
  readonly artifact: {
    readonly type: "artifact";
    readonly artifactId: string;
  };
  readonly name: string;
  readonly mediaType: string;
  readonly themeCount: number;
  readonly issueCount: number;
}
