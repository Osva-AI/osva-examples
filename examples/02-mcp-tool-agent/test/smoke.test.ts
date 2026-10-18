import { describe, expect, it, vi } from "vitest";

import { executeNormalizeText } from "../src/connector.js";
import { buildAgentManifest, extractText, TOOL_BINDING } from "../src/runtime.js";

describe("MCP tool-agent public contracts", () => {
  it("executes the deterministic reference tool without third-party credentials", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await expect(executeNormalizeText({ text: "  hello osva  " })).resolves.toEqual({
      normalized: "HELLO OSVA",
    });
    write.mockRestore();
  });

  it("extracts run input text from canonical JSON objects", () => {
    expect(extractText({ text: "hello" })).toBe("hello");
    expect(() => extractText(["not-an-object"])).toThrow(/object/);
    expect(() => extractText({ text: 1 })).toThrow(/string 'text'/);
  });

  it("binds only a public tool version into the agent manifest", () => {
    const manifest = buildAgentManifest("http://127.0.0.1:8788/execute", "tool_version_test" as never);
    expect(manifest.capabilities.tools).toEqual([TOOL_BINDING]);
    expect(manifest.tools[TOOL_BINDING]).toEqual({ toolVersionId: "tool_version_test" });
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key|authorization|bearer/i);
  });
});
