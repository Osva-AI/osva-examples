# 18 Failure recovery

## What this demonstrates

Retry-tolerant agent execution with **manifest `execution.maxAttempts`**, simulated transient runtime failures, and **application-level checkpointing** keyed by business `jobId` (not runtime `executionId`).

```text
Run (maxAttempts: 3)
  → RunAttempt #1 (executionId A) → transient failure
  → RunAttempt #2 (executionId B) → transient failure
  → RunAttempt #3 (executionId C) → success + single side effect
```

## What OSVA guarantees in v1.0

| Topic                    | OSVA 1.0 behavior                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Retry budget             | Agent manifest `execution.maxAttempts` declares how many RunAttempts the platform may schedule for a Run |
| RunAttempt identity      | Each attempt maps to a distinct runtime `executionId` (see `@osva-ai/sdk/runtime` `RuntimeContext`)      |
| Attempt inspection       | `client.runs.listAttempts(runId)` returns attempt sequence and terminal status                           |
| Run creation idempotency | Optional `idempotencyKey` on `client.runs.create` deduplicates run creation at the API layer             |
| Runtime idempotency      | **Not automatic** — SDK documents that durable deduplication is the agent author's responsibility        |

## What this example implements at application level

| Concern                 | Implementation                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Transient failures      | Throws `RuntimeExecutionError` until `failUntilAttempt` invocations for the same `jobId` |
| Side-effect idempotency | In-process checkpoint store applies billing-style side effects once per `jobId`          |
| Safe replays            | Completed checkpoints return cached output with `deduplicated: true`                     |

The checkpoint store is **process-local** (appropriate for tests and single-node demos). Production agents should persist checkpoints through OSVA memory bindings or your own store.

## Offline vs live

| Mode          | Behavior                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| Offline tests | Checkpoint + runtime failure injection without OSVA                                                  |
| Live          | Registers AgentVersion with `maxAttempts: 3`, creates a Run, polls final attempt, lists all attempts |

Live multi-attempt retry requires the OSVA worker to schedule additional RunAttempts after failed attempts. If your deployment leaves `maxAttempts` at 1 behavior, you will still observe application checkpoint semantics in unit tests.

## Environment variables

See `.env.example`. Key values:

- `OSVA_FAILURE_FAIL_UNTIL_ATTEMPT` — how many runtime invocations fail before success (default `2`)
- `OSVA_EXAMPLE_JOB_ID` — stable business key for checkpointing

## Run

```bash
pnpm example:18
```
