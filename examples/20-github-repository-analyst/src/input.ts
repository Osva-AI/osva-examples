import type { JsonValue } from "@osva-ai/contracts";
import { isJsonRecord } from "@osva-examples/utils";
import { ISSUE_LIST_MAX_PAGE, ISSUE_LIST_MAX_PER_PAGE } from "@osva-ai/connector-github";

/** Hard cap for this example (issues counted toward analysis). */
export const MAX_ISSUE_SAMPLE_ABSOLUTE = 50;

export type IssueStateFilter = "open" | "closed" | "all";

export interface RepositoryAnalystInput {
  readonly owner: string;
  readonly repo: string;
  readonly maxIssueSampleSize: number;
  readonly issueState: IssueStateFilter;
  readonly issuePageLimit: number;
  readonly runKey: string;
}

export function parseRepositoryAnalystInput(input: JsonValue): RepositoryAnalystInput {
  if (!isJsonRecord(input)) {
    throw new Error("Run input must be an object with owner, repo, and maxIssueSampleSize.");
  }

  const owner = parseGithubSlug(input["owner"], "owner");
  const repo = parseGithubSlug(input["repo"], "repo");
  const maxIssueSampleSize = parseBoundedPositiveInt(
    input["maxIssueSampleSize"],
    "maxIssueSampleSize",
    1,
    Math.min(MAX_ISSUE_SAMPLE_ABSOLUTE, ISSUE_LIST_MAX_PER_PAGE),
    true,
  );
  const issueState = parseIssueState(input["issueState"]);
  const issuePageLimit = parseBoundedPositiveInt(
    input["issuePageLimit"],
    "issuePageLimit",
    1,
    ISSUE_LIST_MAX_PAGE,
    false,
  );
  const runKeyRaw = input["runKey"];
  const runKey = typeof runKeyRaw === "string" && runKeyRaw.trim().length > 0 ? runKeyRaw.trim() : `${owner}/${repo}`;

  return { owner, repo, maxIssueSampleSize, issueState, issuePageLimit, runKey };
}

function parseGithubSlug(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Run input must include string '${field}'.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    throw new Error(`'${field}' must be a non-empty GitHub slug (max 100 characters).`);
  }
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(trimmed)) {
    throw new Error(`'${field}' is not a valid GitHub repository slug.`);
  }
  return trimmed;
}

function parseIssueState(value: unknown): IssueStateFilter {
  if (value === undefined) return "open";
  if (value === "open" || value === "closed" || value === "all") return value;
  throw new Error("Optional 'issueState' must be open, closed, or all.");
}

function parseBoundedPositiveInt(value: unknown, field: string, min: number, max: number, required: boolean): number {
  if (value === undefined) {
    if (required) {
      throw new Error(`Run input must include positive integer '${field}'.`);
    }
    return min;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`'${field}' must be an integer.`);
  }
  if (value < min || value > max) {
    throw new Error(`'${field}' must be between ${min} and ${max}.`);
  }
  return value;
}
