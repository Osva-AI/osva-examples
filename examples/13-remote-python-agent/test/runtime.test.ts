import { describe, expect, it } from "vitest";

import { buildAgentManifest, extractText } from "../src/runtime.js";

describe("remote python agent manifest contracts", () => {
  it("extracts canonical text input", () => {
    expect(extractText({ text: " hello " })).toBe(" hello ");
    expect(() => extractText(["bad"])).toThrow(/object/);
    expect(() => extractText({ text: "" })).toThrow(/non-empty/);
  });

  it("declares a model-free REMOTE_HTTP manifest", () => {
    const manifest = buildAgentManifest("http://127.0.0.1:8790/execute");
    expect(manifest.runtime.type).toBe("REMOTE_HTTP");
    expect(manifest.capabilities.model).toBe(false);
    expect(manifest.capabilities.tools).toEqual([]);
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key|authorization|bearer/i);
  });
});
