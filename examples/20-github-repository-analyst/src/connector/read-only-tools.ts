import {
  GITHUB_ISSUE_COMMENT_CREATE_TOOL,
  GITHUB_ISSUE_CREATE_TOOL,
  GITHUB_ISSUE_GET_TOOL,
  GITHUB_ISSUE_LIST_TOOL,
  GITHUB_REPOSITORY_GET_TOOL,
} from "@osva-ai/connector-github";

export const APPROVED_READ_TOOLS = new Set<string>([
  GITHUB_REPOSITORY_GET_TOOL,
  GITHUB_ISSUE_LIST_TOOL,
  GITHUB_ISSUE_GET_TOOL,
]);

export const PROHIBITED_WRITE_TOOLS = new Set<string>([GITHUB_ISSUE_CREATE_TOOL, GITHUB_ISSUE_COMMENT_CREATE_TOOL]);

export function assertReadOnlyDiscovery(remoteToolNames: readonly string[]): void {
  for (const required of APPROVED_READ_TOOLS) {
    if (!remoteToolNames.includes(required)) {
      throw new Error(`MCP discovery missing required read-only tool: ${required}`);
    }
  }
}

export function selectReadOnlyToolsForImport(remoteToolNames: readonly string[]): string[] {
  assertReadOnlyDiscovery(remoteToolNames);
  return remoteToolNames.filter((name) => APPROVED_READ_TOOLS.has(name));
}

export function assertImportedToolsAreReadOnly(importedRemoteNames: readonly string[]): void {
  for (const name of importedRemoteNames) {
    if (PROHIBITED_WRITE_TOOLS.has(name)) {
      throw new Error(`Prohibited GitHub write tool must not be imported: ${name}`);
    }
    if (!APPROVED_READ_TOOLS.has(name)) {
      throw new Error(`Unexpected MCP tool in import list: ${name}`);
    }
  }
}
