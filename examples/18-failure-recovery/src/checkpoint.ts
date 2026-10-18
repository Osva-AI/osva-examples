import type { JsonObject } from "@osva-ai/contracts";

export interface RecoveryJobInput {
  readonly jobId: string;
  readonly failUntilAttempt: number;
  readonly payload: string;
}

export interface CheckpointRecord {
  readonly jobId: string;
  readonly invocationCount: number;
  readonly sideEffectsApplied: number;
  readonly completed: boolean;
  readonly result?: JsonObject;
}

const store = new Map<string, CheckpointRecord>();

export function resetCheckpointStore(): void {
  store.clear();
}

export function parseRecoveryInput(raw: unknown): RecoveryJobInput {
  if (typeof raw !== "object" || raw === null) throw new Error("Run input must be an object.");
  const record = raw as Record<string, unknown>;
  const jobId = record["jobId"];
  if (typeof jobId !== "string" || jobId.trim().length === 0) {
    throw new Error("jobId must be a non-empty string.");
  }
  const failUntilAttempt = record["failUntilAttempt"];
  if (typeof failUntilAttempt !== "number" || !Number.isInteger(failUntilAttempt) || failUntilAttempt < 1) {
    throw new Error("failUntilAttempt must be a positive integer.");
  }
  const payload = record["payload"];
  if (typeof payload !== "string") throw new Error("payload must be a string.");
  return { jobId: jobId.trim(), failUntilAttempt, payload };
}

/**
 * Application-level checkpointing keyed by business `jobId`.
 * Each OSVA RunAttempt delivers a distinct runtime `executionId`; this store
 * survives process-local retries and makes side effects idempotent.
 */
export function runWithCheckpoint(
  executionId: string,
  input: RecoveryJobInput,
): { readonly status: "failed" | "succeeded"; readonly output: JsonObject } {
  const existing = store.get(input.jobId);
  if (existing?.completed === true && existing.result !== undefined) {
    return {
      status: "succeeded",
      output: JSON.parse(
        JSON.stringify({
          ...existing.result,
          deduplicated: true,
          lastExecutionId: executionId,
        }),
      ) as JsonObject,
    };
  }

  const invocationCount = (existing?.invocationCount ?? 0) + 1;
  const sideEffectsApplied = existing?.sideEffectsApplied ?? 0;

  if (invocationCount < input.failUntilAttempt) {
    store.set(input.jobId, {
      jobId: input.jobId,
      invocationCount,
      sideEffectsApplied,
      completed: false,
    });
    return {
      status: "failed",
      output: JSON.parse(
        JSON.stringify({
          jobId: input.jobId,
          executionId,
          invocationCount,
          failUntilAttempt: input.failUntilAttempt,
          stage: "transient_failure",
        }),
      ) as JsonObject,
    };
  }

  const nextSideEffects = sideEffectsApplied + 1;
  const result = JSON.parse(
    JSON.stringify({
      jobId: input.jobId,
      executionId,
      invocationCount,
      failUntilAttempt: input.failUntilAttempt,
      payloadDigest: input.payload,
      sideEffectsApplied: nextSideEffects,
      stage: "completed",
    }),
  ) as JsonObject;

  store.set(input.jobId, {
    jobId: input.jobId,
    invocationCount,
    sideEffectsApplied: nextSideEffects,
    completed: true,
    result,
  });

  return { status: "succeeded", output: result };
}

export function getCheckpoint(jobId: string): CheckpointRecord | undefined {
  return store.get(jobId);
}
