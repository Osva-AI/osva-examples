import type { EvidenceRecord, ResearchAnalysis, ResearchPlan, ThemeConfidence, ThemeFinding } from "./types.js";

const THEME_LABELS: Record<string, string> = {
  "business-pressure": "Business pressure",
  "operational-benefits": "Operational benefits",
  "implementation-concerns": "Implementation concerns",
};

export function synthesizeThemes(evidence: readonly EvidenceRecord[], plan: ResearchPlan): ResearchAnalysis {
  const themesByKey = new Map<string, EvidenceRecord[]>();
  for (const record of evidence) {
    const bucket = themesByKey.get(record.theme) ?? [];
    bucket.push(record);
    themesByKey.set(record.theme, bucket);
  }

  const themes: ThemeFinding[] = [];
  for (const [themeKey, records] of themesByKey) {
    const distinctSources = new Set(records.map((record) => record.sourceId));
    const hasConflict = records.some((record) => record.contradicts !== undefined);
    const strongModerate = records.filter((record) => record.strength !== "weak").length;
    const onlyWeak = records.every((record) => record.strength === "weak");

    let confidence: ThemeConfidence = "low";
    if (distinctSources.size >= 2 && strongModerate >= 2 && !hasConflict) {
      confidence = "high";
    } else if (distinctSources.size >= 2 || strongModerate >= 2) {
      confidence = "medium";
    }
    if (onlyWeak || distinctSources.size === 1) {
      confidence = "low";
    }
    if (hasConflict && confidence === "high") {
      confidence = "medium";
    }

    const caveats: string[] = [];
    if (hasConflict) {
      caveats.push("Conflicting evidence exists for this theme; see review and report sections.");
    }
    if (onlyWeak) {
      caveats.push("Findings rely on weak or promotional sources only.");
    }
    if (distinctSources.size === 1) {
      caveats.push("Theme is supported by a single source in the collected set.");
    }

    themes.push({
      name: THEME_LABELS[themeKey] ?? themeKey,
      finding: summarizeThemeFinding(themeKey, records),
      supportingEvidenceIds: records.map((record) => record.id),
      confidence,
      caveats,
    });
  }

  const order = new Map(plan.evidenceNeeded.map((key, index) => [themeLabel(key), index]));
  themes.sort(
    (left, right) =>
      (order.get(left.name) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.name) ?? Number.MAX_SAFE_INTEGER) ||
      left.name.localeCompare(right.name),
  );
  return { themes };
}

function themeLabel(themeKey: string): string {
  return THEME_LABELS[themeKey] ?? themeKey;
}

export function applyReviewAdjustments(
  analysis: ResearchAnalysis,
  reviewIssueThemes: ReadonlySet<string>,
): ResearchAnalysis {
  return {
    themes: analysis.themes.map((theme) => {
      if (!reviewIssueThemes.has(theme.name) && !reviewIssueThemes.has(theme.name.toLowerCase())) {
        return theme;
      }
      const downgraded =
        theme.confidence === "high" ? "medium" : theme.confidence === "medium" ? "low" : theme.confidence;
      return {
        ...theme,
        confidence: downgraded,
        caveats: [...theme.caveats, "Confidence downgraded after evidence review."],
      };
    }),
  };
}

function summarizeThemeFinding(themeKey: string, records: readonly EvidenceRecord[]): string {
  const lead = records[0];
  if (lead === undefined) {
    return `No evidence collected for ${themeKey}.`;
  }
  const additional = records.length - 1;
  if (additional === 0) {
    return lead.claim;
  }
  return `${lead.claim} (+${additional} related evidence record${additional === 1 ? "" : "s"})`;
}
