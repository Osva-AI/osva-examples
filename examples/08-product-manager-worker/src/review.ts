import type {
  BriefReview,
  BriefReviewIssue,
  ProductBrief,
  ProductEvidenceBundle,
  ProductOpportunity,
} from "./types.js";

export function reviewProductBrief(input: {
  readonly brief: ProductBrief;
  readonly evidence: ProductEvidenceBundle;
  readonly opportunity: ProductOpportunity | undefined;
}): BriefReview {
  const issues: BriefReviewIssue[] = [];
  const { brief, evidence, opportunity } = input;

  if (opportunity?.evidenceStrength === "low") {
    issues.push({
      type: "weak-evidence",
      description: "The chosen opportunity has low evidence strength relative to other clusters.",
    });
  }

  if (brief.successMetrics.length === 0 || brief.successMetrics.some((metric) => metric.trim().length < 8)) {
    issues.push({
      type: "missing-metric",
      description: "Success metrics are missing or too vague to measure activation impact.",
    });
  }

  if (brief.proposedApproach.some((step) => /launch dark mode|full redesign/i.test(step))) {
    issues.push({
      type: "scope-risk",
      description: "Proposed approach includes scope that exceeds current constraints.",
    });
  }

  if (brief.goal.toLowerCase().includes("activation") && brief.proposedApproach[0]?.toLowerCase().includes("dark")) {
    issues.push({
      type: "solution-bias",
      description: "Brief leans on cosmetic theming before solving activation blockers.",
    });
  }

  const pricingConflict = evidence.feedback.some((item) => /enterprise sso/i.test(item.text));
  if (pricingConflict && brief.goal.toLowerCase().includes("activation")) {
    issues.push({
      type: "business-conflict",
      description:
        "Customer feedback highlights enterprise pricing cues while the brief targets SMB activation — clarify positioning.",
    });
  }

  if (brief.problem.length < 20) {
    issues.push({
      type: "unsupported-assumption",
      description: "Problem statement is too thin to justify the proposed approach.",
    });
  }

  const summary =
    issues.length === 0
      ? "Brief passes deterministic review with no blocking issues."
      : `Reviewer flagged ${issues.length} concern(s) for the product lead to acknowledge before approval.`;

  return { issues, summary };
}
