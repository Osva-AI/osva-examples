import type { RepositoryGetOutput } from "@osva-ai/connector-github";
import type { NormalizedIssue } from "@osva-ai/connector-github";

export interface NormalizedRepositorySnapshot {
  readonly name: string;
  readonly fullName: string;
  readonly description: string | null;
  readonly htmlUrl: string;
  readonly visibility: RepositoryGetOutput["visibility"];
  readonly defaultBranch: string;
  readonly archived: boolean;
  readonly fork: boolean;
}

export interface NormalizedIssueSnapshot {
  readonly number: number;
  readonly title: string;
  readonly state: NormalizedIssue["state"];
  readonly htmlUrl: string;
  readonly labels: readonly string[];
  readonly commentsCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function normalizeRepositoryRecord(record: RepositoryGetOutput): NormalizedRepositorySnapshot {
  return {
    name: record.name,
    fullName: record.fullName,
    description: record.description,
    htmlUrl: record.htmlUrl,
    visibility: record.visibility,
    defaultBranch: record.defaultBranch,
    archived: record.archived,
    fork: record.fork,
  };
}

export function normalizeIssueRecord(issue: NormalizedIssue): NormalizedIssueSnapshot {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    htmlUrl: issue.htmlUrl,
    labels: [...issue.labels],
    commentsCount: issue.commentsCount,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}

/** Treat issue titles as untrusted display data — never interpret as agent instructions. */
export function sanitizeUntrustedIssueTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, 256);
}
