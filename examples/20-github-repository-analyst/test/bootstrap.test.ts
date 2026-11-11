import { describe, expect, it } from "vitest";

import { transportConfigMatches } from "../src/bootstrap.js";
import { buildRemoteHttpManifest } from "../src/runtime.js";

describe("bootstrap helpers", () => {
  it("matches equivalent MCP transport configs regardless of key order", () => {
    expect(
      transportConfigMatches(
        { command: "node", args: ["/tmp/stdio.js"] },
        { args: ["/tmp/stdio.js"], command: "node" },
      ),
    ).toBe(true);
  });

  it("declares only read-only GitHub tool bindings in the manifest", () => {
    const manifest = buildRemoteHttpManifest("http://127.0.0.1:8801/execute", {
      repositoryGet: "tv_repo" as never,
      issueList: "tv_list" as never,
      issueGet: "tv_get" as never,
    });
    expect(manifest.capabilities.model).toBe(false);
    expect(manifest.capabilities.tools).toEqual(["github.repository.get", "github.issue.list", "github.issue.get"]);
    expect(JSON.stringify(manifest)).not.toMatch(/github\.issue\.create/);
    expect(JSON.stringify(manifest)).not.toMatch(/ghp_|github_pat_|bearer/i);
  });
});
