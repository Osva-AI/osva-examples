import { describe, expect, it } from "vitest";

import { createGithubConnector } from "@osva-ai/connector-github";

import {
  assertImportedToolsAreReadOnly,
  PROHIBITED_WRITE_TOOLS,
  selectReadOnlyToolsForImport,
} from "../src/connector/read-only-tools.js";
import { READ_ONLY_GITHUB_REMOTE_TOOLS } from "../src/bindings.js";
import { buildPublishedGithubConnectorStdioTransport } from "../src/connector/stdio-command.js";

describe("published @osva-ai/connector-github (offline)", () => {
  it("exposes read and write tools in the package (example imports read-only only)", () => {
    const connector = createGithubConnector({
      client: {
        getRepository: async () => {
          throw new Error("offline");
        },
        listIssues: async () => {
          throw new Error("offline");
        },
        getIssue: async () => {
          throw new Error("offline");
        },
        createIssue: async () => {
          throw new Error("offline");
        },
        createIssueComment: async () => {
          throw new Error("offline");
        },
      },
    });
    const names = connector.tools.map((tool) => tool.name);
    for (const required of READ_ONLY_GITHUB_REMOTE_TOOLS) {
      expect(names).toContain(required);
    }
    for (const prohibited of PROHIBITED_WRITE_TOOLS) {
      expect(names).toContain(prohibited);
    }
  });

  it("filters importable tools to the read-only allowlist", () => {
    const remote = [
      "github.repository.get",
      "github.issue.list",
      "github.issue.get",
      "github.issue.create",
      "github.issue.comment.create",
    ];
    const selected = selectReadOnlyToolsForImport(remote);
    expect(selected).toEqual(["github.repository.get", "github.issue.list", "github.issue.get"]);
    expect(() => assertImportedToolsAreReadOnly(["github.issue.create"])).toThrow(/write tool/);
  });

  it("resolves published github connector stdio entry from node_modules", () => {
    const transport = buildPublishedGithubConnectorStdioTransport();
    expect(transport.args[0]).toMatch(/connector-github[/\\]dist[/\\]stdio\.js$/);
  });
});
