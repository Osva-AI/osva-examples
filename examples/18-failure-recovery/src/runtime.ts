import type { JsonObject, JsonValue } from "@osva-ai/contracts";
import { createRuntime, RuntimeExecutionError } from "@osva-ai/sdk/runtime";

import { parseRecoveryInput, runWithCheckpoint } from "./checkpoint.js";

export function executeRecoveryJob(input: JsonValue, executionId: string): JsonObject {
  const parsed = parseRecoveryInput(input);
  const outcome = runWithCheckpoint(executionId, parsed);
  if (outcome.status === "failed") {
    throw new RuntimeExecutionError(
      `Simulated transient failure for ${parsed.jobId} (invocation ${String(outcome.output["invocationCount"])})`,
      "TRANSIENT_FAILURE",
    );
  }
  return outcome.output;
}

export const failureRecoveryRuntime = createRuntime({
  execute: (input, context) => executeRecoveryJob(input, context.executionId),
});

export function buildAgentManifest(runtimeUrl: string) {
  return {
    schemaVersion: "1" as const,
    key: "failure-recovery-agent",
    name: "Failure Recovery Agent",
    runtime: { type: "REMOTE_HTTP" as const, protocolVersion: "1" as const, endpoint: runtimeUrl, timeoutMs: 30_000 },
    input: {
      schema: {
        type: "object",
        properties: {
          jobId: { type: "string", minLength: 1 },
          failUntilAttempt: { type: "integer", minimum: 1 },
          payload: { type: "string" },
        },
        required: ["jobId", "failUntilAttempt", "payload"],
        additionalProperties: false,
      },
    },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 30_000, maxAttempts: 3 },
    capabilities: { model: false, tools: [] as string[] },
  };
}
