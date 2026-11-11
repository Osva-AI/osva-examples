import type { IssueListOutput, NormalizedIssue, RepositoryGetOutput } from "@osva-ai/connector-github";
import { ISSUE_LIST_MAX_PER_PAGE } from "@osva-ai/connector-github";

import {
  FIXTURE_RUN_KEY,
  TOOL_BINDING_ISSUE_GET,
  TOOL_BINDING_ISSUE_LIST,
  TOOL_BINDING_REPOSITORY_GET,
  toolIdempotencyKey,
} from "./bindings.js";
import { buildRepositoryBrief, buildSamplingMetadata } from "./analysis.js";
import { buildDeterministicFixtureBrief, isFixtureRepository } from "./fixtures.js";
import { parseRepositoryAnalystInput } from "./input.js";
import { normalizeIssueRecord, normalizeRepositoryRecord, sanitizeUntrustedIssueTitle } from "./normalize.js";
import type { RepositoryAnalystStructuredOutput, TrustedRepositoryAnalystContext } from "./agent-types.js";

export async function runRepositoryAnalystAgent(
  context: TrustedRepositoryAnalystContext,
): Promise<RepositoryAnalystStructuredOutput> {
  const request = parseRepositoryAnalystInput(context.input);
  const analysisTimestamp = new Date().toISOString();

  if (isFixtureRepository(request.owner, request.repo) && request.runKey === FIXTURE_RUN_KEY) {
    const brief = buildDeterministicFixtureBrief();
    return {
      ...brief,
      owner: request.owner,
      repo: request.repo,
      analysisTimestamp,
      runKey: request.runKey,
    };
  }

  const repositoryRaw = (await context.tools.invoke(
    TOOL_BINDING_REPOSITORY_GET,
    { owner: request.owner, repo: request.repo },
    { idempotencyKey: toolIdempotencyKey(request.runKey, TOOL_BINDING_REPOSITORY_GET) },
  )) as RepositoryGetOutput;

  const repository = normalizeRepositoryRecord(repositoryRaw);
  const perPage = Math.min(request.maxIssueSampleSize, ISSUE_LIST_MAX_PER_PAGE);

  const collected: ReturnType<typeof normalizeIssueRecord>[] = [];
  let pagesFetched = 0;
  let hasMoreOnProvider = false;

  for (let page = 1; page <= request.issuePageLimit && collected.length < request.maxIssueSampleSize; page++) {
    pagesFetched += 1;
    const listRaw = (await context.tools.invoke(
      TOOL_BINDING_ISSUE_LIST,
      {
        owner: request.owner,
        repo: request.repo,
        state: request.issueState,
        perPage,
        page,
      },
      { idempotencyKey: toolIdempotencyKey(request.runKey, TOOL_BINDING_ISSUE_LIST) },
    )) as IssueListOutput;

    for (const issue of listRaw.issues) {
      if (collected.length >= request.maxIssueSampleSize) break;
      collected.push(normalizeIssueRecord(issue));
    }

    hasMoreOnProvider = listRaw.hasNextPage === true;
    if (!hasMoreOnProvider || collected.length >= request.maxIssueSampleSize) {
      break;
    }
  }

  const sampling = buildSamplingMetadata({
    requestedSampleSize: request.maxIssueSampleSize,
    sampledCount: collected.length,
    pagesFetched,
    issueStateFilter: request.issueState,
    hasMoreOnProvider,
  });

  let brief = buildRepositoryBrief({
    repository,
    issues: collected,
    sampling,
  });

  if (request.focusIssueNumber !== undefined) {
    const issueRaw = (await context.tools.invoke(
      TOOL_BINDING_ISSUE_GET,
      { owner: request.owner, repo: request.repo, issueNumber: request.focusIssueNumber },
      { idempotencyKey: toolIdempotencyKey(request.runKey, TOOL_BINDING_ISSUE_GET) },
    )) as NormalizedIssue;
    const focusIssue = normalizeIssueRecord(issueRaw);
    brief = {
      ...brief,
      evidence: [
        ...brief.evidence,
        {
          id: `issue:focus:${focusIssue.number}`,
          kind: "issue",
          detail: `Focus issue #${focusIssue.number} state=${focusIssue.state} title="${sanitizeUntrustedIssueTitle(focusIssue.title)}"`,
        },
      ],
      recommendations: [
        ...brief.recommendations,
        {
          id: "rec-focus-issue-review",
          action: `Review focus issue #${focusIssue.number} in context of the sampled issue window.`,
          rationale: "Optional read-only github.issue.get enrichment for a specific issue number.",
          evidenceIds: [`issue:focus:${focusIssue.number}`],
        },
      ],
    };
  }

  return {
    ...brief,
    owner: request.owner,
    repo: request.repo,
    analysisTimestamp,
    runKey: request.runKey,
  };
}
