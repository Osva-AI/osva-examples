import { GITHUB_ISSUE_GET_TOOL, GITHUB_ISSUE_LIST_TOOL, GITHUB_REPOSITORY_GET_TOOL } from "@osva-ai/connector-github";

export const TOOL_BINDING_REPOSITORY_GET = GITHUB_REPOSITORY_GET_TOOL;
export const TOOL_BINDING_ISSUE_LIST = GITHUB_ISSUE_LIST_TOOL;
export const TOOL_BINDING_ISSUE_GET = GITHUB_ISSUE_GET_TOOL;

export const READ_ONLY_GITHUB_REMOTE_TOOLS = [
  GITHUB_REPOSITORY_GET_TOOL,
  GITHUB_ISSUE_LIST_TOOL,
  GITHUB_ISSUE_GET_TOOL,
] as const;

export const FIXTURE_REPO_OWNER = "osva-examples-fixture" as const;
export const FIXTURE_REPO_NAME = "deterministic-github-brief" as const;
export const FIXTURE_RUN_KEY = "evaluation-fixture" as const;

export function toolIdempotencyKey(runKey: string, tool: (typeof READ_ONLY_GITHUB_REMOTE_TOOLS)[number]): string {
  return `examples-20:${runKey}:${tool}`;
}
