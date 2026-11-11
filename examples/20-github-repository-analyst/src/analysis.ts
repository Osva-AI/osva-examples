import type { NormalizedIssueSnapshot, NormalizedRepositorySnapshot } from "./normalize.js";
import { sanitizeUntrustedIssueTitle } from "./normalize.js";

export interface IssueSamplingMetadata {
  readonly requestedSampleSize: number;
  readonly sampledCount: number;
  readonly pagesFetched: number;
  readonly issueStateFilter: string;
  readonly hasMoreOnProvider: boolean;
  readonly limitation: string;
}

export interface IssueSummary {
  readonly sampledCount: number;
  readonly openInSample: number;
  readonly closedInSample: number;
  readonly labelCounts: Record<string, number>;
  readonly sampling: IssueSamplingMetadata;
}

export interface ThemeFinding {
  readonly id: string;
  readonly label: string;
  readonly issueNumbers: readonly number[];
}

export interface RiskFinding {
  readonly id: string;
  readonly severity: "info" | "warning";
  readonly summary: string;
}

export interface RecommendationFinding {
  readonly id: string;
  readonly action: string;
  readonly rationale: string;
  readonly evidenceIds: readonly string[];
}

export interface EvidenceItem {
  readonly id: string;
  readonly kind: "repository" | "issue";
  readonly detail: string;
}

export interface RepositoryBrief {
  readonly repository: NormalizedRepositorySnapshot;
  readonly issueSummary: IssueSummary;
  readonly themes: readonly ThemeFinding[];
  readonly risks: readonly RiskFinding[];
  readonly recommendations: readonly RecommendationFinding[];
  readonly evidence: readonly EvidenceItem[];
}

const MAX_THEMES = 12;
const MAX_RISKS = 10;
const MAX_RECOMMENDATIONS = 10;
const MAX_EVIDENCE = 40;

const KEYWORD_THEMES: readonly { readonly id: string; readonly label: string; readonly pattern: RegExp }[] = [
  { id: "theme-security", label: "Security-related titles", pattern: /\b(cve|security|vuln|xss|auth)\b/i },
  { id: "theme-docs", label: "Documentation-related titles", pattern: /\b(doc|readme|guide|tutorial)\b/i },
  { id: "theme-bug", label: "Bug-related titles", pattern: /\b(bug|fix|regression|broken|crash)\b/i },
];

export function buildRepositoryBrief(options: {
  readonly repository: NormalizedRepositorySnapshot;
  readonly issues: readonly NormalizedIssueSnapshot[];
  readonly sampling: IssueSamplingMetadata;
}): RepositoryBrief {
  const evidence: EvidenceItem[] = [
    {
      id: "repository:metadata",
      kind: "repository",
      detail: `Repository ${options.repository.fullName} visibility=${options.repository.visibility} archived=${options.repository.archived}`,
    },
  ];

  const openInSample = options.issues.filter((issue) => issue.state === "open").length;
  const closedInSample = options.issues.length - openInSample;

  const labelCounts: Record<string, number> = {};
  for (const issue of options.issues) {
    evidence.push({
      id: `issue:${issue.number}`,
      kind: "issue",
      detail: `Issue #${issue.number} state=${issue.state} title="${sanitizeUntrustedIssueTitle(issue.title)}" labels=${issue.labels.join(",") || "(none)"}`,
    });
    for (const label of issue.labels) {
      labelCounts[label] = (labelCounts[label] ?? 0) + 1;
    }
  }

  const themes = collectThemes(options.issues).slice(0, MAX_THEMES);
  const risks = collectRisks(options.repository, options.issues, openInSample).slice(0, MAX_RISKS);
  const recommendations = collectRecommendations(options.repository, risks, options.sampling).slice(
    0,
    MAX_RECOMMENDATIONS,
  );

  return {
    repository: options.repository,
    issueSummary: {
      sampledCount: options.issues.length,
      openInSample,
      closedInSample,
      labelCounts,
      sampling: options.sampling,
    },
    themes,
    risks,
    recommendations,
    evidence: evidence.slice(0, MAX_EVIDENCE),
  };
}

function collectThemes(issues: readonly NormalizedIssueSnapshot[]): ThemeFinding[] {
  const findings: ThemeFinding[] = [];

  const labelMap = new Map<string, number[]>();
  for (const issue of issues) {
    for (const label of issue.labels) {
      const bucket = labelMap.get(label) ?? [];
      bucket.push(issue.number);
      labelMap.set(label, bucket);
    }
  }

  for (const [label, numbers] of [...labelMap.entries()].sort((a, b) => b[1].length - a[1].length)) {
    findings.push({
      id: `theme-label-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label: `Label: ${label}`,
      issueNumbers: numbers,
    });
  }

  for (const theme of KEYWORD_THEMES) {
    const matched: number[] = [];
    for (const issue of issues) {
      const safeTitle = sanitizeUntrustedIssueTitle(issue.title);
      if (theme.pattern.test(safeTitle)) {
        matched.push(issue.number);
      }
    }
    if (matched.length > 0) {
      findings.push({ id: theme.id, label: theme.label, issueNumbers: matched });
    }
  }

  return findings;
}

function collectRisks(
  repository: NormalizedRepositorySnapshot,
  issues: readonly NormalizedIssueSnapshot[],
  openInSample: number,
): RiskFinding[] {
  const risks: RiskFinding[] = [];

  if (repository.archived) {
    risks.push({
      id: "risk-archived",
      severity: "warning",
      summary: "Repository is archived; issue triage may be frozen.",
    });
  }
  if (repository.fork) {
    risks.push({
      id: "risk-fork",
      severity: "info",
      summary: "Repository is a fork; upstream divergence may affect issue relevance.",
    });
  }
  if (issues.length > 0 && openInSample === issues.length) {
    risks.push({
      id: "risk-all-open-sample",
      severity: "info",
      summary: "Every sampled issue is open (within the sampled page window).",
    });
  }

  return risks;
}

function collectRecommendations(
  repository: NormalizedRepositorySnapshot,
  risks: readonly RiskFinding[],
  sampling: IssueSamplingMetadata,
): RecommendationFinding[] {
  const recommendations: RecommendationFinding[] = [];

  if (repository.archived) {
    recommendations.push({
      id: "rec-archived",
      action: "Confirm whether maintenance should continue elsewhere before investing in new work.",
      rationale: "Archived repositories signal reduced ongoing maintenance on GitHub.",
      evidenceIds: ["repository:metadata", "risk-archived"],
    });
  }

  if (sampling.hasMoreOnProvider) {
    recommendations.push({
      id: "rec-expand-sample",
      action: "Increase pagination or sample size only after reviewing the current sample.",
      rationale: "Additional issues exist beyond this bounded sample.",
      evidenceIds: ["repository:metadata"],
    });
  }

  if (risks.some((risk) => risk.id === "risk-all-open-sample")) {
    recommendations.push({
      id: "rec-triage-open",
      action: "Review open issues in the sample for staleness and prioritization.",
      rationale: "The sampled window contains only open issues.",
      evidenceIds: ["risk-all-open-sample"],
    });
  }

  return recommendations;
}

export function buildSamplingMetadata(options: {
  readonly requestedSampleSize: number;
  readonly sampledCount: number;
  readonly pagesFetched: number;
  readonly issueStateFilter: string;
  readonly hasMoreOnProvider: boolean;
}): IssueSamplingMetadata {
  const limitation =
    options.sampledCount < options.requestedSampleSize
      ? `Sampled ${options.sampledCount} issues (requested up to ${options.requestedSampleSize}). Provider returned fewer matching issues in ${options.pagesFetched} page(s).`
      : options.hasMoreOnProvider
        ? `Sample capped at ${options.sampledCount} issues across ${options.pagesFetched} page(s); more issues may exist on GitHub.`
        : `Sample includes ${options.sampledCount} issues from ${options.pagesFetched} page(s); no further pages reported by the provider.`;

  return {
    requestedSampleSize: options.requestedSampleSize,
    sampledCount: options.sampledCount,
    pagesFetched: options.pagesFetched,
    issueStateFilter: options.issueStateFilter,
    hasMoreOnProvider: options.hasMoreOnProvider,
    limitation,
  };
}
