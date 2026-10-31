import { describe, expect, it } from "vitest";

import { transportConfigMatches } from "../src/bootstrap.js";
import { buildPublishedNpmConnectorStdioTransport } from "../src/connector/stdio-command.js";
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

  it("resolves published npm connector stdio entry from node_modules", () => {
    const transport = buildPublishedNpmConnectorStdioTransport();
    expect(transport.command.length).toBeGreaterThan(0);
    expect(transport.args.length).toBe(1);
    expect(transport.args[0]).toMatch(/connector-npm[/\\]dist[/\\]stdio\.js$/);
  });

  it("declares model and npm tool bindings in the manifest", () => {
    const manifest = buildRemoteHttpManifest("http://127.0.0.1:8799/execute", "mpv_test" as never, {
      npmPackageMetadata: "tv_meta" as never,
      npmDownloads: "tv_dl" as never,
    });
    expect(manifest.capabilities.model).toBe(true);
    expect(manifest.capabilities.tools).toEqual(["npm_package_metadata", "npm_downloads"]);
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key|authorization|bearer|sk-[A-Za-z0-9]/i);
  });
});
