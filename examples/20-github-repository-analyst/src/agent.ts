import type { IssueListOutput } from "@osva-ai/connector-github";
import type { RepositoryGetOutput } from "@osva-ai/connector-github";
import { ISSUE_LIST_MAX_PER_PAGE } from "@osva-ai/connector-github";

import {
  FIXTURE_RUN_KEY,
  TOOL_BINDING_ISSUE_LIST,
  TOOL_BINDING_REPOSITORY_GET,
  toolIdempotencyKey,
} from "./bindings.js";
import { buildRepositoryBrief, buildSamplingMetadata } from "./analysis.js";
import { buildDeterministicFixtureBrief, isFixtureRepository } from "./fixtures.js";
import { parseRepositoryAnalystInput } from "./input.js";
import { normalizeIssueRecord, normalizeRepositoryRecord } from "./normalize.js";
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

  const brief = buildRepositoryBrief({
    repository,
    issues: collected,
    sampling,
  });

  return {
    ...brief,
    owner: request.owner,
    repo: request.repo,
    analysisTimestamp,
    runKey: request.runKey,
  };
}
