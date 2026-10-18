export interface PollResult<T> {
  readonly value: T;
  readonly attempts: number;
  readonly elapsedMs: number;
}

export interface PollWithDeadlineOptions<T> {
  readonly description: string;
  readonly read: () => Promise<T>;
  readonly isDone: (value: T) => boolean;
  readonly summarize: (value: T) => string;
  readonly timeoutMs: number;
  readonly intervalMs: number;
}

export class PollTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PollTimeoutError";
  }
}

export async function pollWithDeadline<T>(options: PollWithDeadlineOptions<T>): Promise<PollResult<T>> {
  if (options.timeoutMs <= 0 || options.intervalMs <= 0) {
    throw new Error("Polling timeout and interval must be positive.");
  }

  const startedAt = Date.now();
  const deadline = startedAt + options.timeoutMs;
  let attempts = 0;
  let lastValue: T | undefined;

  while (true) {
    attempts += 1;
    lastValue = await options.read();
    const now = Date.now();
    if (options.isDone(lastValue)) {
      return { value: lastValue, attempts, elapsedMs: now - startedAt };
    }
    if (now >= deadline) {
      throw timeoutError(options, lastValue, attempts, now - startedAt);
    }
    await sleep(Math.min(options.intervalMs, Math.max(1, deadline - now)));
  }
}

function timeoutError<T>(
  options: PollWithDeadlineOptions<T>,
  lastValue: T,
  attempts: number,
  elapsedMs: number,
): PollTimeoutError {
  return new PollTimeoutError(
    `Timed out waiting for ${options.description} after ${String(elapsedMs)}ms ` +
      `and ${String(attempts)} attempts. Last observed state: ${options.summarize(lastValue)}.`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
