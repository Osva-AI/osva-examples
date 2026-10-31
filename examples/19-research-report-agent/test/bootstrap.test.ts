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
