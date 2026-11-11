import { describe, expect, it } from "vitest";

import { buildRepositoryBrief, buildSamplingMetadata } from "../src/analysis.js";
import { FIXTURE_ISSUE_LIST, FIXTURE_REPOSITORY } from "../src/fixtures.js";
import { normalizeIssueRecord, normalizeRepositoryRecord } from "../src/normalize.js";

describe("deterministic repository brief", () => {
  it("builds evidence-linked recommendations", () => {
    const brief = buildRepositoryBrief({
      repository: normalizeRepositoryRecord(FIXTURE_REPOSITORY),
      issues: FIXTURE_ISSUE_LIST.issues.map((issue) => normalizeIssueRecord(issue)),
      sampling: buildSamplingMetadata({
        requestedSampleSize: 3,
        sampledCount: 3,
        pagesFetched: 1,
        issueStateFilter: "all",
        hasMoreOnProvider: false,
      }),
    });

    expect(brief.issueSummary.sampledCount).toBe(3);
    expect(brief.themes.some((theme) => theme.label.startsWith("Label:"))).toBe(true);
    for (const recommendation of brief.recommendations) {
      expect(recommendation.evidenceIds.length).toBeGreaterThan(0);
    }
  });

  it("handles empty issue lists", () => {
    const brief = buildRepositoryBrief({
      repository: normalizeRepositoryRecord(FIXTURE_REPOSITORY),
      issues: [],
      sampling: buildSamplingMetadata({
        requestedSampleSize: 5,
        sampledCount: 0,
        pagesFetched: 1,
        issueStateFilter: "open",
        hasMoreOnProvider: false,
      }),
    });
    expect(brief.issueSummary.sampledCount).toBe(0);
    expect(brief.recommendations.every((item) => item.evidenceIds.includes("repository:metadata"))).toBe(true);
  });

  it("does not invent counts beyond the sample", () => {
    const brief = buildRepositoryBrief({
      repository: normalizeRepositoryRecord(FIXTURE_REPOSITORY),
      issues: FIXTURE_ISSUE_LIST.issues.map((issue) => normalizeIssueRecord(issue)),
      sampling: buildSamplingMetadata({
        requestedSampleSize: 3,
        sampledCount: 3,
        pagesFetched: 1,
        issueStateFilter: "all",
        hasMoreOnProvider: false,
      }),
    });
    expect(brief.issueSummary.openInSample + brief.issueSummary.closedInSample).toBe(3);
  });
});

describe("untrusted issue titles", () => {
  it("treats injection text as data only", () => {
    const brief = buildRepositoryBrief({
      repository: normalizeRepositoryRecord(FIXTURE_REPOSITORY),
      issues: [normalizeIssueRecord(FIXTURE_ISSUE_LIST.issues[2] ?? FIXTURE_ISSUE_LIST.issues[0]!)],
      sampling: buildSamplingMetadata({
        requestedSampleSize: 1,
        sampledCount: 1,
        pagesFetched: 1,
        issueStateFilter: "all",
        hasMoreOnProvider: false,
      }),
    });
    expect(JSON.stringify(brief)).toContain("Ignore previous instructions");
    expect(brief.themes.length).toBeGreaterThanOrEqual(0);
  });
});
