import { afterEach, describe, expect, it, vi } from "vitest";

import { runRemotePythonExample } from "../src/app.js";
import { resolvePythonLaunch } from "../src/python-runtime.js";

const fetchMock = vi.fn<typeof fetch>();

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const pythonAvailable = await resolvePythonLaunch(process.env)
  .then(() => true)
  .catch(() => false);

describe.runIf(pythonAvailable)("remote python orchestration smoke contract", () => {
  it("creates a run against a live Python runtime with mocked OSVA APIs", async () => {
    // Python startup + process teardown can exceed the default Vitest timeout on Windows.
    fetchMock
      .mockResolvedValueOnce(
        response({
          id: "agent_123",
          key: "examples-python-agent",
          name: "Examples Python Agent",
          createdAt: "2026-10-18T00:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        response({
          id: "agent_version_123",
          agentId: "agent_123",
          version: 1,
          manifest: {},
          createdAt: "2026-10-18T00:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        response({
          run: {
            id: "run_123",
            workspaceId: "workspace_123",
            agentId: "agent_123",
            status: "QUEUED",
            effectiveBindings: {
              agentVersionId: "agent_version_123",
              modelProfileVersionBindings: {},
              toolVersionBindings: {},
            },
            input: { text: "hello" },
            createdAt: "2026-10-18T00:00:00.000Z",
            updatedAt: "2026-10-18T00:00:00.000Z",
          },
          runAttempt: {
            id: "attempt_123",
            runId: "run_123",
            sequence: 1,
            status: "PENDING",
            createdAt: "2026-10-18T00:00:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          id: "attempt_123",
          runId: "run_123",
          sequence: 1,
          status: "SUCCEEDED",
          createdAt: "2026-10-18T00:00:00.000Z",
          completedAt: "2026-10-18T00:00:01.000Z",
          output: { input: "hello", normalized: "HELLO", runtimeLanguage: "python" },
        }),
      );
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit): ReturnType<typeof fetch> => {
      const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (href.includes("osva.test")) {
        return fetchMock(input, init);
      }
      return realFetch(input, init);
    });

    const runtimePort = 40_000 + Math.floor(Math.random() * 10_000);
    const result = await runRemotePythonExample({
      OSVA_BASE_URL: "http://osva.test",
      OSVA_API_KEY: "test-only-key",
      OSVA_AGENT_RUNTIME_URL: `http://127.0.0.1:${String(runtimePort)}/execute`,
      OSVA_EXAMPLE_LISTEN_HOST: "127.0.0.1",
      OSVA_EXAMPLE_RUNTIME_PORT: String(runtimePort),
      OSVA_EXAMPLE_INPUT_TEXT: "hello",
      OSVA_RUN_TIMEOUT_MS: "100",
      OSVA_POLL_INTERVAL_MS: "1",
    });

    expect(result.attemptStatus).toBe("SUCCEEDED");
    expect(result.output).toEqual({ input: "hello", normalized: "HELLO", runtimeLanguage: "python" });
  }, 20_000);
});

describe.skipIf(pythonAvailable)("remote python orchestration smoke contract", () => {
  it("documents skipped orchestration smoke when Python is unavailable", () => {
    expect(true).toBe(true);
  });
});
