import { describe, expect, it } from "vitest";

import { pollWithDeadline, PollTimeoutError } from "../src/poll.js";

describe("pollWithDeadline", () => {
  it("returns terminal state and attempt count", async () => {
    let state = 0;
    const result = await pollWithDeadline({
      description: "counter",
      read: async () => ++state,
      isDone: (value) => value === 3,
      summarize: String,
      timeoutMs: 100,
      intervalMs: 1,
    });
    expect(result.value).toBe(3);
    expect(result.attempts).toBe(3);
  });

  it("reports elapsed time, attempts, and last state on timeout", async () => {
    await expect(
      pollWithDeadline({
        description: "never terminal",
        read: async () => "RUNNING",
        isDone: () => false,
        summarize: (value) => value,
        timeoutMs: 5,
        intervalMs: 1,
      }),
    ).rejects.toBeInstanceOf(PollTimeoutError);

    await expect(
      pollWithDeadline({
        description: "never terminal",
        read: async () => "RUNNING",
        isDone: () => false,
        summarize: (value) => value,
        timeoutMs: 5,
        intervalMs: 1,
      }),
    ).rejects.toThrow(/Last observed state: RUNNING/);
  });
});
