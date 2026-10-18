import type {
  EvidenceRecord,
  EvidenceReview,
  ResearchAnalysis,
  ResearchPlan,
  ReviewIssue,
  ThemeFinding,
} from "./types.js";

export function reviewEvidence(
  plan: ResearchPlan,
  evidence: readonly EvidenceRecord[],
  analysis: ResearchAnalysis,
): EvidenceReview {
  const issues: ReviewIssue[] = [
    ...detectConflicts(evidence),
    ...detectWeakEvidenceThemes(analysis.themes, evidence),
    ...detectSingleSourceThemes(analysis.themes, evidence),
    ...detectCoverageGaps(plan, evidence),
    ...detectOverconfidentThemes(analysis.themes, evidence),
  ];
  issues.sort(
    (left, right) => left.type.localeCompare(right.type) || left.description.localeCompare(right.description),
  );

  const summary =
    issues.length === 0
      ? "Evidence review found no major traceability, conflict, or coverage issues in the fixture corpus."
      : `Evidence review flagged ${issues.length} issue(s) requiring caveats in the final report.`;

  return { issues, summary };
}

export function collectThemesWithReviewIssues(review: EvidenceReview): Set<string> {
  const themes = new Set<string>();
  for (const issue of review.issues) {
    if (issue.relatedTheme !== undefined) {
      themes.add(issue.relatedTheme);
    }
  }
  return themes;
}

function detectConflicts(evidence: readonly EvidenceRecord[]): ReviewIssue[] {
  const seen = new Set<string>();
  const issues: ReviewIssue[] = [];
  for (const record of evidence) {
    if (record.contradicts === undefined) continue;
    const pairKey = [record.id, record.contradicts].sort().join("|");
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);
    issues.push({
      type: "conflict",
      description:
        `Conflicting claims about ${record.theme}: ${record.id} disagrees with ${record.contradicts}. ` +
        "Both records are preserved for the final report.",
      relatedEvidenceIds: [record.id, record.contradicts],
      relatedTheme: themeLabel(record.theme),
    });
  }
  return issues;
}

function detectWeakEvidenceThemes(themes: readonly ThemeFinding[], evidence: readonly EvidenceRecord[]): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  for (const theme of themes) {
    const related = evidence.filter((record) => theme.supportingEvidenceIds.includes(record.id));
    if (related.length > 0 && related.every((record) => record.strength === "weak")) {
      issues.push({
        type: "weak-evidence",
        description: `${theme.name} relies solely on weak-strength evidence.`,
        relatedEvidenceIds: related.map((record) => record.id),
        relatedTheme: theme.name,
      });
    }
  }
  return issues;
}

function detectSingleSourceThemes(themes: readonly ThemeFinding[], evidence: readonly EvidenceRecord[]): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  for (const theme of themes) {
    const sources = new Set(
      evidence.filter((record) => theme.supportingEvidenceIds.includes(record.id)).map((record) => record.sourceId),
    );
    if (sources.size === 1 && theme.supportingEvidenceIds.length > 0) {
      issues.push({
        type: "weak-evidence",
        description: `${theme.name} is supported by only one source in the collected set.`,
        relatedEvidenceIds: [...theme.supportingEvidenceIds],
        relatedTheme: theme.name,
      });
    }
  }
  return issues;
}

function detectCoverageGaps(plan: ResearchPlan, evidence: readonly EvidenceRecord[]): ReviewIssue[] {
  const themesPresent = new Set(evidence.map((record) => record.theme));
  const issues: ReviewIssue[] = [];
  for (const needed of plan.evidenceNeeded) {
    if (needed === "cross-source consistency") {
      const sourceCount = new Set(evidence.map((record) => record.sourceId)).size;
      if (sourceCount < 2) {
        issues.push({
          type: "coverage-gap",
          description: "Plan expected cross-source consistency checks but fewer than two sources were collected.",
        });
      }
      continue;
    }
    if (!themesPresent.has(needed)) {
      issues.push({
        type: "coverage-gap",
        description: `Research plan expected evidence for '${needed}' but none was extracted.`,
        relatedTheme: themeLabel(needed),
      });
    }
  }
  return issues;
}

function detectOverconfidentThemes(
  themes: readonly ThemeFinding[],
  evidence: readonly EvidenceRecord[],
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  for (const theme of themes) {
    if (theme.confidence !== "high") continue;
    const related = evidence.filter((record) => theme.supportingEvidenceIds.includes(record.id));
    const distinctSources = new Set(related.map((record) => record.sourceId));
    if (distinctSources.size < 2 || related.some((record) => record.contradicts !== undefined)) {
      issues.push({
        type: "unsupported",
        description: `${theme.name} was marked high confidence but review criteria are not fully met.`,
        relatedEvidenceIds: related.map((record) => record.id),
        relatedTheme: theme.name,
      });
    }
  }
  return issues;
}

function themeLabel(themeKey: string): string {
  if (themeKey === "business-pressure") return "Business pressure";
  if (themeKey === "operational-benefits") return "Operational benefits";
  if (themeKey === "implementation-concerns") return "Implementation concerns";
  return themeKey;
}
