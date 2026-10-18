import { afterEach, describe, expect, it } from "vitest";

import { RuntimeExecutionError } from "@osva-ai/sdk/runtime";

import { getCheckpoint, parseRecoveryInput, resetCheckpointStore, runWithCheckpoint } from "../src/checkpoint.js";
import { buildAgentManifest, executeRecoveryJob } from "../src/runtime.js";

afterEach(() => {
  resetCheckpointStore();
});

describe("failure recovery agent contracts", () => {
  it("declares maxAttempts in the agent manifest for platform retry budget", () => {
    const manifest = buildAgentManifest("http://127.0.0.1:8799/execute");
    expect(manifest.execution.maxAttempts).toBe(3);
  });

  it("fails transiently until failUntilAttempt then succeeds once", () => {
    const input = { jobId: "job_a", failUntilAttempt: 2, payload: "sync" };
    expect(() => executeRecoveryJob(input, "exec_1")).toThrow(RuntimeExecutionError);
    const success = executeRecoveryJob(input, "exec_2");
    expect(success["stage"]).toBe("completed");
    expect(getCheckpoint("job_a")?.sideEffectsApplied).toBe(1);
  });

  it("deduplicates completed jobs across new execution ids", () => {
    const parsed = parseRecoveryInput({ jobId: "job_b", failUntilAttempt: 1, payload: "x" });
    runWithCheckpoint("exec_1", parsed);
    const again = runWithCheckpoint("exec_2", parsed);
    expect(again.status).toBe("succeeded");
    expect(again.output["deduplicated"]).toBe(true);
    expect(getCheckpoint("job_b")?.sideEffectsApplied).toBe(1);
  });

  it("tracks invocation count separately from side effects", () => {
    const input = { jobId: "job_c", failUntilAttempt: 3, payload: "p" };
    expect(() => executeRecoveryJob(input, "exec_1")).toThrow(RuntimeExecutionError);
    expect(() => executeRecoveryJob(input, "exec_2")).toThrow(RuntimeExecutionError);
    executeRecoveryJob(input, "exec_3");
    expect(getCheckpoint("job_c")?.invocationCount).toBe(3);
    expect(getCheckpoint("job_c")?.sideEffectsApplied).toBe(1);
  });
});
