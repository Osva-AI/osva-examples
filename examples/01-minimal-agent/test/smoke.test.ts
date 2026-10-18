import { afterEach, describe, expect, it, vi } from "vitest";

import { runMinimalAgent } from "../src/app.js";

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

describe("minimal agent smoke contract", () => {
  it("creates a run and observes the terminal attempt without real credentials", async () => {
    fetchMock
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
            input: { message: "hi" },
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
          output: { ok: true },
        }),
      )
      .mockResolvedValueOnce(
        response({
          id: "run_123",
          workspaceId: "workspace_123",
          agentId: "agent_123",
          status: "SUCCEEDED",
          effectiveBindings: {
            agentVersionId: "agent_version_123",
            modelProfileVersionBindings: {},
            toolVersionBindings: {},
          },
          input: { message: "hi" },
          createdAt: "2026-10-18T00:00:00.000Z",
          updatedAt: "2026-10-18T00:00:01.000Z",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runMinimalAgent({
      OSVA_BASE_URL: "http://osva.test",
      OSVA_API_KEY: "test-only-key",
      OSVA_AGENT_ID: "agent_123",
      OSVA_AGENT_VERSION_ID: "agent_version_123",
      OSVA_RUN_INPUT: '{"message":"hi"}',
      OSVA_RUN_TIMEOUT_MS: "100",
      OSVA_POLL_INTERVAL_MS: "1",
    });

    expect(result.attemptStatus).toBe("SUCCEEDED");
    expect(result.output).toEqual({ ok: true });
    const createRequest = fetchMock.mock.calls[0]?.[1];
    expect(createRequest?.headers).toMatchObject({ authorization: "Bearer test-only-key" });
  });
});
