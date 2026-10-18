import { describe, expect, it, vi } from "vitest";

import {
  MODEL_BINDING,
  buildAgentManifest,
  buildGenerateTextOptions,
  executeModelPoweredAgent,
  parseModelAgentInput,
  parseModelAgentOutput,
} from "../src/runtime.js";

describe("model-powered agent runtime contracts", () => {
  it("validates run input", () => {
    expect(parseModelAgentInput({ question: "  hello?  " })).toEqual({ question: "hello?" });
    expect(parseModelAgentInput({ question: "x", maxOutputTokens: 64 })).toEqual({
      question: "x",
      maxOutputTokens: 64,
    });
    expect(() => parseModelAgentInput(["bad"])).toThrow(/object/);
    expect(() => parseModelAgentInput({ question: "" })).toThrow(/non-empty/);
    expect(() => parseModelAgentInput({ question: "ok", maxOutputTokens: 0 })).toThrow(/positive integer/);
  });

  it("declares model capability and binding in the manifest", () => {
    const manifest = buildAgentManifest("http://127.0.0.1:8789/execute", "model_profile_version_test" as never);
    expect(manifest.capabilities.model).toBe(true);
    expect(manifest.capabilities.tools).toEqual([]);
    expect(manifest.models?.[MODEL_BINDING]).toEqual({ modelProfileVersionId: "model_profile_version_test" });
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key|authorization|bearer|sk-[A-Za-z0-9]/i);
  });

  it("builds the runtime model generateText request shape", () => {
    const options = buildGenerateTextOptions({ question: "Need a refund" });
    expect(options.binding).toBe(MODEL_BINDING);
    expect(options.messages).toHaveLength(2);
    expect(options.messages[0]?.role).toBe("system");
    expect(options.messages[1]).toEqual({ role: "user", content: "Need a refund" });
  });

  it("parses structured model output and rejects malformed responses", () => {
    expect(parseModelAgentOutput("Need a refund", '{"category":"billing"}')).toEqual({
      question: "Need a refund",
      category: "billing",
      modelText: '{"category":"billing"}',
      binding: MODEL_BINDING,
    });
    expect(() => parseModelAgentOutput("q", "")).toThrow(/empty text/);
    expect(() => parseModelAgentOutput("q", "not-json")).toThrow(/valid classification JSON/);
    expect(() => parseModelAgentOutput("q", '{"category":"unknown"}')).toThrow(/not one of/);
  });

  it("invokes the model binding through runtime context", async () => {
    const generateText = vi.fn().mockResolvedValue({ text: '{"category":"support"}' });
    await expect(
      executeModelPoweredAgent({ question: "My login is broken" }, { models: { generateText } }),
    ).resolves.toMatchObject({ category: "support", binding: MODEL_BINDING });
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ binding: MODEL_BINDING, messages: expect.any(Array) }),
    );
  });

  it("propagates model capability failures", async () => {
    const generateText = vi.fn().mockRejectedValue(new Error("Bearer osva_ak_secret-token leaked"));
    await expect(executeModelPoweredAgent({ question: "test" }, { models: { generateText } })).rejects.toThrow(
      /Bearer osva_ak_secret-token leaked/,
    );
  });
});
