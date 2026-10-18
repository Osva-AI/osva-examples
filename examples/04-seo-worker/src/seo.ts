import type {
  PageSnapshot,
  SeoAuditResult,
  SeoCategory,
  SeoPriorityLevel,
  SeoRecommendation,
  SeoWorkerRequest,
} from "./types.js";

const LEVEL_WEIGHT: Record<SeoPriorityLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const EFFORT_WEIGHT: Record<SeoPriorityLevel, number> = {
  high: 1,
  medium: 2,
  low: 3,
};

export function analyzePageSeo(page: PageSnapshot, request: SeoWorkerRequest): SeoAuditResult {
  const keyword = request.targetKeyword.toLowerCase();
  const findings: SeoRecommendation[] = [
    ...technicalFindings(page),
    ...onPageFindings(page, keyword),
    ...contentFindings(page, keyword),
    ...internalLinkingFindings(page, keyword),
  ];
  const recommendations = prioritizeRecommendations(findings);
  const summary = buildQualitativeSummary(recommendations);
  return { recommendations, summary };
}

export function prioritizeRecommendations(recommendations: readonly SeoRecommendation[]): readonly SeoRecommendation[] {
  return [...recommendations].sort((left, right) => {
    const scoreDelta = recommendationScore(right) - recommendationScore(left);
    if (scoreDelta !== 0) return scoreDelta;
    return left.id.localeCompare(right.id);
  });
}

export function recommendationScore(recommendation: SeoRecommendation): number {
  return (
    LEVEL_WEIGHT[recommendation.severity] * 100 +
    LEVEL_WEIGHT[recommendation.impact] * 10 +
    EFFORT_WEIGHT[recommendation.effort]
  );
}

export function renderMarkdownAudit(request: SeoWorkerRequest, page: PageSnapshot, audit: SeoAuditResult): string {
  const byCategory = (category: SeoCategory) => audit.recommendations.filter((item) => item.category === category);
  const highest = audit.recommendations.slice(0, 5);

  const lines: string[] = [
    "# SEO Audit",
    "",
    "## Page",
    `URL: ${request.url}`,
    `Target keyword: ${request.targetKeyword}`,
    `Business context: ${request.businessContext ?? "(none provided)"}`,
    "",
    "## Executive Summary",
    audit.summary,
    "",
    "## Highest Priority Actions",
  ];

  if (highest.length === 0) {
    lines.push("- No actionable findings were detected from the available page data.");
  } else {
    for (const item of highest) {
      lines.push(
        `- **${item.id}** (${item.severity} severity, ${item.impact} impact, ${item.effort} effort): ${item.recommendation}`,
      );
    }
  }

  lines.push("", "## Technical Findings", ...formatCategorySection(byCategory("technical")));
  lines.push("", "## On-Page Findings", ...formatCategorySection(byCategory("on-page")));
  lines.push("", "## Content Opportunities", ...formatCategorySection(byCategory("content")));
  lines.push("", "## Internal Linking Opportunities", ...formatCategorySection(byCategory("internal-linking")));
  lines.push(
    "",
    "## Recommended Next Actions",
    "- Address the highest-priority items above, then re-run this audit after publishing changes.",
    "- Extend this worker with Search Console, analytics, or SERP data before treating results as production-grade.",
    "",
    "## Evidence Appendix",
    `- Crawled title: ${page.title ?? "(missing)"}`,
    `- Word count (fixture): ${page.stats.wordCount}`,
    `- Internal links: ${page.stats.internalLinkCount}`,
    `- Images: ${page.images.length}`,
    "",
  );

  return lines.join("\n");
}

function formatCategorySection(items: readonly SeoRecommendation[]): string[] {
  if (items.length === 0) {
    return ["- No findings in this category from the available input."];
  }
  const section: string[] = [];
  for (const item of items) {
    section.push(`### ${item.id}: ${item.finding}`);
    section.push(`- Severity: ${item.severity}; Impact: ${item.impact}; Effort: ${item.effort}`);
    section.push(`- Recommendation: ${item.recommendation}`);
    if (item.evidence !== undefined) {
      section.push(`- Evidence: ${item.evidence}`);
    }
    section.push("");
  }
  return section;
}

function buildQualitativeSummary(recommendations: readonly SeoRecommendation[]): string {
  if (recommendations.length === 0) {
    return "No rule-based issues were detected from the normalized page snapshot.";
  }
  const high = recommendations.filter((item) => item.severity === "high").length;
  const medium = recommendations.filter((item) => item.severity === "medium").length;
  const low = recommendations.filter((item) => item.severity === "low").length;
  const top = recommendations[0];
  const lead =
    top === undefined ? "Review the categorized findings below." : `Start with ${top.id}: ${top.recommendation}`;
  return (
    `Rule-based review found ${recommendations.length} opportunities ` +
    `(${high} high, ${medium} medium, ${low} low severity). ${lead}`
  );
}

function technicalFindings(page: PageSnapshot): SeoRecommendation[] {
  const findings: SeoRecommendation[] = [];

  if (page.canonical === null || page.canonical.trim().length === 0) {
    findings.push(
      rec({
        id: "tech-canonical-missing",
        category: "technical",
        severity: "high",
        impact: "high",
        effort: "low",
        finding: "Canonical URL is missing.",
        recommendation: "Add a self-referencing canonical link that matches the preferred indexable URL.",
        evidence: "canonical is null in the page snapshot",
      }),
    );
  }

  if (page.title === null || page.title.trim().length === 0) {
    findings.push(
      rec({
        id: "tech-title-missing",
        category: "technical",
        severity: "high",
        impact: "high",
        effort: "low",
        finding: "Document title is missing.",
        recommendation: "Add a unique, descriptive title tag.",
      }),
    );
  } else if (page.title.length < 15 || page.title.length > 60) {
    findings.push(
      rec({
        id: "tech-title-length",
        category: "technical",
        severity: "medium",
        impact: "medium",
        effort: "low",
        finding: "Title length is outside the common 15–60 character range.",
        recommendation: "Rewrite the title to fit the target keyword and stay within a concise SERP-friendly length.",
        evidence: `title length=${page.title.length}`,
      }),
    );
  }

  if (page.metaDescription === null || page.metaDescription.trim().length === 0) {
    findings.push(
      rec({
        id: "tech-meta-description-missing",
        category: "technical",
        severity: "medium",
        impact: "medium",
        effort: "low",
        finding: "Meta description is missing.",
        recommendation: "Add a compelling meta description that reflects search intent for the target keyword.",
      }),
    );
  } else if (page.metaDescription.length < 50 || page.metaDescription.length > 160) {
    findings.push(
      rec({
        id: "tech-meta-description-length",
        category: "technical",
        severity: "low",
        impact: "low",
        effort: "low",
        finding: "Meta description length is outside the common 50–160 character range.",
        recommendation: "Expand or tighten the meta description so it summarizes the page within typical SERP limits.",
        evidence: `meta description length=${page.metaDescription.length}`,
      }),
    );
  }

  const h1s = page.headings.filter((heading) => heading.level === 1);
  if (h1s.length === 0) {
    findings.push(
      rec({
        id: "tech-h1-missing",
        category: "technical",
        severity: "high",
        impact: "high",
        effort: "low",
        finding: "No H1 heading was found.",
        recommendation: "Add exactly one H1 that states the primary topic of the page.",
      }),
    );
  } else if (h1s.length > 1) {
    findings.push(
      rec({
        id: "tech-h1-multiple",
        category: "technical",
        severity: "medium",
        impact: "medium",
        effort: "low",
        finding: "Multiple H1 headings were found.",
        recommendation: "Keep a single primary H1 and demote secondary headings to H2 or lower.",
        evidence: `h1 count=${h1s.length}`,
      }),
    );
  }

  const hierarchyIssue = findHeadingHierarchySkip(page.headings);
  if (hierarchyIssue !== null) {
    findings.push(
      rec({
        id: "tech-heading-hierarchy",
        category: "technical",
        severity: "medium",
        impact: "medium",
        effort: "medium",
        finding: "Heading levels skip a rank in the hierarchy.",
        recommendation: "Reorder headings so levels increase sequentially (for example H1 → H2 → H3).",
        evidence: hierarchyIssue,
      }),
    );
  }

  const missingAlt = page.images.filter((image) => image.alt === null || image.alt.trim().length === 0);
  if (missingAlt.length > 0) {
    findings.push(
      rec({
        id: "tech-image-alt",
        category: "technical",
        severity: "medium",
        impact: "medium",
        effort: "low",
        finding: "One or more images are missing meaningful alt text.",
        recommendation: "Add descriptive alt attributes that explain each image's purpose.",
        evidence: `${missingAlt.length} of ${page.images.length} images lack alt text`,
      }),
    );
  }

  if (page.robotsMeta !== null && /\bnoindex\b/i.test(page.robotsMeta)) {
    findings.push(
      rec({
        id: "tech-noindex",
        category: "technical",
        severity: "high",
        impact: "high",
        effort: "medium",
        finding: "Robots meta indicates the page should not be indexed.",
        recommendation: "Remove noindex unless this URL is intentionally non-indexable.",
        evidence: `robots=${page.robotsMeta}`,
      }),
    );
  }

  if (page.structuredDataTypes.length === 0) {
    findings.push(
      rec({
        id: "tech-structured-data-absent",
        category: "technical",
        severity: "low",
        impact: "low",
        effort: "medium",
        finding: "No structured data types were detected in the snapshot.",
        recommendation: "Consider adding JSON-LD for the primary entity on the page (for example Product or FAQ).",
      }),
    );
  }

  return findings;
}

function onPageFindings(page: PageSnapshot, keyword: string): SeoRecommendation[] {
  const findings: SeoRecommendation[] = [];
  const title = page.title?.toLowerCase() ?? "";
  const h1 = page.headings.find((heading) => heading.level === 1)?.text.toLowerCase() ?? "";
  const body = page.bodyText.toLowerCase();
  const keywordCount = countOccurrences(body, keyword);
  const words = wordCount(body);

  if (page.title !== null && !title.includes(keyword)) {
    findings.push(
      rec({
        id: "onpage-keyword-title",
        category: "on-page",
        severity: "high",
        impact: "high",
        effort: "low",
        finding: "Target keyword is not present in the title.",
        recommendation: "Include the primary keyword near the beginning of the title while keeping it readable.",
        evidence: `title="${page.title}"`,
      }),
    );
  }

  if (h1.length > 0 && !h1.includes(keyword)) {
    findings.push(
      rec({
        id: "onpage-keyword-h1",
        category: "on-page",
        severity: "medium",
        impact: "medium",
        effort: "low",
        finding: "Target keyword is not present in the H1.",
        recommendation: "Align the H1 with the keyword and the user's search intent.",
      }),
    );
  }

  if (words > 0 && keywordCount === 0) {
    findings.push(
      rec({
        id: "onpage-keyword-body-absent",
        category: "on-page",
        severity: "medium",
        impact: "medium",
        effort: "medium",
        finding: "Target keyword does not appear in the main body text.",
        recommendation: "Work the keyword naturally into introductory copy and supporting sections.",
      }),
    );
  }

  if (words >= 50 && keywordCount / words > 0.04) {
    findings.push(
      rec({
        id: "onpage-keyword-stuffing",
        category: "on-page",
        severity: "medium",
        impact: "medium",
        effort: "low",
        finding: "Keyword usage in body copy appears unusually dense.",
        recommendation: "Reduce repetition and use synonyms or related phrases to improve readability.",
        evidence: `${keywordCount} occurrences in ~${words} words`,
      }),
    );
  }

  return findings;
}

function contentFindings(page: PageSnapshot, keyword: string): SeoRecommendation[] {
  const findings: SeoRecommendation[] = [];
  const words = page.stats.wordCount > 0 ? page.stats.wordCount : wordCount(page.bodyText);
  const h2Count = page.headings.filter((heading) => heading.level === 2).length;
  const combined = `${page.bodyText} ${page.headings.map((heading) => heading.text).join(" ")}`.toLowerCase();

  if (words < 300) {
    findings.push(
      rec({
        id: "content-thin",
        category: "content",
        severity: "high",
        impact: "high",
        effort: "high",
        finding: "Body content appears thin for a competitive keyword target.",
        recommendation: "Expand the page with intent-matching sections such as benefits, use cases, and comparisons.",
        evidence: `word count=${words}`,
      }),
    );
  }

  if (h2Count === 0) {
    findings.push(
      rec({
        id: "content-missing-sections",
        category: "content",
        severity: "medium",
        impact: "medium",
        effort: "medium",
        finding: "No H2 subsections were found to structure the topic.",
        recommendation: "Break the page into scannable H2 sections that cover subtopics related to the keyword.",
      }),
    );
  }

  if (!combined.includes("faq") && !combined.includes("frequently asked")) {
    findings.push(
      rec({
        id: "content-faq-gap",
        category: "content",
        severity: "low",
        impact: "medium",
        effort: "medium",
        finding: "No FAQ or question-and-answer style content was detected.",
        recommendation: "Add an FAQ block that answers common questions about the target topic.",
      }),
    );
  }

  if (keyword.length > 0 && !combined.includes("pricing") && !combined.includes("compare")) {
    findings.push(
      rec({
        id: "content-intent-coverage",
        category: "content",
        severity: "low",
        impact: "medium",
        effort: "medium",
        finding: "Commercial evaluation signals (pricing/comparison) were not detected.",
        recommendation: "Clarify value proposition and add comparison or pricing context if the page targets buyers.",
      }),
    );
  }

  return findings;
}

function internalLinkingFindings(page: PageSnapshot, keyword: string): SeoRecommendation[] {
  const findings: SeoRecommendation[] = [];
  const internalLinks = page.links.filter((link) => link.internal);

  if (internalLinks.length < 3) {
    findings.push(
      rec({
        id: "links-internal-count",
        category: "internal-linking",
        severity: "medium",
        impact: "medium",
        effort: "low",
        finding: "The page has few internal links.",
        recommendation: "Add contextual internal links to related product, pricing, and resource pages.",
        evidence: `internal links=${internalLinks.length}`,
      }),
    );
  }

  const keywordAnchor = internalLinks.some((link) => link.text.toLowerCase().includes(keyword));
  if (!keywordAnchor && internalLinks.length > 0) {
    findings.push(
      rec({
        id: "links-keyword-anchor",
        category: "internal-linking",
        severity: "low",
        impact: "low",
        effort: "low",
        finding: "No internal link anchor text references the target keyword.",
        recommendation: "Use descriptive anchor text on at least one relevant internal link.",
      }),
    );
  }

  return findings;
}

function findHeadingHierarchySkip(headings: PageSnapshot["headings"]): string | null {
  let previous = 0;
  for (const heading of headings) {
    if (previous === 0) {
      previous = heading.level;
      continue;
    }
    if (heading.level > previous + 1) {
      return `jumped from H${previous} to H${heading.level} ("${heading.text}")`;
    }
    previous = heading.level;
  }
  return null;
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = 0;
  while (index <= haystack.length) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    count += 1;
    index = found + needle.length;
  }
  return count;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

function rec(input: SeoRecommendation): SeoRecommendation {
  return input;
}
