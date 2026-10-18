import { afterEach, describe, expect, it, vi } from "vitest";

import { CapabilityCredential, RuntimeCapabilityError, createRuntimeContext } from "@osva-ai/sdk/runtime";

import { redactSensitiveText } from "@osva-examples/utils";

import { MODEL_BINDING, buildGenerateTextOptions } from "../src/runtime.js";

const fetchMock = vi.fn<typeof fetch>();

afterEach(() => {
  fetchMock.mockReset();
});

describe("OSVA runtime model capability wire contract (offline)", () => {
  it("posts a generateText capability request and parses success", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          protocolVersion: "1",
          executionId: "exec_123",
          outcome: "SUCCEEDED",
          result: { text: '{"category":"product"}' },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const credential = new CapabilityCredential("http://capabilities.test", "capability-token-secret");
    const context = createRuntimeContext({
      executionId: "exec_123",
      credential,
      fetch: fetchMock,
      timeoutMs: 5_000,
    });

    const result = await context.models.generateText(
      buildGenerateTextOptions({ question: "Which plan includes SSO?" }),
    );
    expect(result.text).toContain("product");

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(requestInit?.headers)).not.toContain("capability-token-secret");
    const body = JSON.parse(String(requestInit?.body));
    expect(body.bindingName).toBe(MODEL_BINDING);
    expect(body.executionId).toBe("exec_123");
    expect(body.input.messages[1].content).toBe("Which plan includes SSO?");
  });

  it("maps failed model gateway responses to RuntimeCapabilityError", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          protocolVersion: "1",
          executionId: "exec_123",
          outcome: "FAILED",
          error: { code: "MODEL_RATE_LIMITED", message: "Bearer sk-live-abc rate limited" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const credential = new CapabilityCredential("http://capabilities.test", "capability-token-secret");
    const context = createRuntimeContext({
      executionId: "exec_123",
      credential,
      fetch: fetchMock,
    });

    let caught: unknown;
    try {
      await context.models.generateText(buildGenerateTextOptions({ question: "test" }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RuntimeCapabilityError);
    const message = caught instanceof Error ? caught.message : String(caught);
    expect(redactSensitiveText(message)).toContain("rate limited");
    expect(redactSensitiveText(message)).not.toMatch(/sk-live-abc/);
  });

  it("does not expose capability tokens via default credential stringification", () => {
    const credential = new CapabilityCredential("http://capabilities.test", "capability-token-secret");
    expect(String(credential)).not.toContain("capability-token-secret");
    expect(credential.inspect()).not.toContain("capability-token-secret");
  });
});
