import { afterEach, describe, expect, it, vi } from "vitest";

import { runModelPoweredExample } from "../src/app.js";

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

describe("model-powered example orchestration smoke contract", () => {
  it("registers an agent with a model binding and observes MODEL run steps", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          subjectId: "api_key_123",
          workspaceId: "workspace_123",
          role: "ADMIN",
        }),
      )
      .mockResolvedValueOnce(
        response({
          id: "agent_123",
          key: "examples-model-agent",
          name: "Examples Model Agent",
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
              modelProfileVersionBindings: { classifier_model: "model_profile_version_123" },
              toolVersionBindings: {},
            },
            input: { question: "Refund?" },
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
          output: {
            question: "Refund?",
            category: "billing",
            modelText: '{"category":"billing"}',
            binding: "classifier_model",
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          steps: [
            {
              id: "step_model_1",
              kind: "MODEL",
              bindingName: "classifier_model",
              status: "SUCCEEDED",
              modelProfileVersionId: "model_profile_version_123",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runModelPoweredExample({
      OSVA_BASE_URL: "http://osva.test",
      OSVA_API_KEY: "test-only-key",
      OSVA_AGENT_RUNTIME_URL: "http://127.0.0.1:8789/execute",
      OSVA_MODEL_PROFILE_VERSION_ID: "model_profile_version_123",
      OSVA_EXAMPLE_LISTEN_HOST: "127.0.0.1",
      OSVA_EXAMPLE_RUNTIME_PORT: "8789",
      OSVA_EXAMPLE_INPUT_QUESTION: "Refund?",
      OSVA_RUN_TIMEOUT_MS: "100",
      OSVA_POLL_INTERVAL_MS: "1",
    });

    expect(result.attemptStatus).toBe("SUCCEEDED");
    expect(result.modelProfileVersionId).toBe("model_profile_version_123");
    expect(result.modelActivity).toEqual([
      expect.objectContaining({ kind: "MODEL", bindingName: "classifier_model", status: "SUCCEEDED" }),
    ]);

    const modelProfileCreate = fetchMock.mock.calls.find((call) => String(call[0]).includes("/v1/model-profiles"));
    expect(modelProfileCreate).toBeUndefined();
  });
});
