# 01 Minimal agent run

## What this teaches

This is the smallest external-user OSVA run flow: authenticate with an API key, submit an existing AgentVersion through `@osva-ai/sdk`, poll the created RunAttempt using a wall-clock deadline, then display the final run state and attempt output.

## Prerequisites

- Node.js 24+ and pnpm 12.4.1
- OSVA OSS 1.0.0 reachable through `OSVA_BASE_URL`
- A machine/API key in `OSVA_API_KEY`
- An existing executable Agent and AgentVersion

## Configure

Copy `.env.example` as a personal reference, but export values in your shell. The example does not auto-load `.env` files.

Required: `OSVA_BASE_URL`, `OSVA_API_KEY`, `OSVA_AGENT_ID`, `OSVA_AGENT_VERSION_ID`. `OSVA_RUN_INPUT`, `OSVA_RUN_TIMEOUT_MS`, and `OSVA_POLL_INTERVAL_MS` are optional.

Never put the API key in the run input.

## Build and run

From the repository root:

```bash
pnpm install
pnpm --filter @osva-examples/01-minimal-agent build
pnpm example:01
```

Or from this directory:

```bash
pnpm build
pnpm start
```

## Expected output shape

```json
{
  "runId": "<server-generated run id>",
  "runStatus": "SUCCEEDED",
  "runAttemptId": "<server-generated attempt id>",
  "attemptStatus": "SUCCEEDED",
  "output": {},
  "polling": {
    "attempts": 1,
    "elapsedMs": 0
  }
}
```

IDs and elapsed values above are shapes, not promised values.

## Common failures

- Missing environment variables fail before a network request.
- HTTP 401 means the API key is missing, invalid, or no longer active.
- HTTP 403 means the principal lacks the required permission.
- HTTP 400 generally means the IDs or input violate the stable request contract.
- `FAILED`, `TIMED_OUT`, or `CANCELLED` is reported as the terminal attempt status and produces a non-zero process exit.
- A polling timeout reports elapsed time, attempt count, and the last observed state.

## Cleanup

This example starts no local process and creates one durable OSVA Run. No local cleanup is required. Retain the Run for observability/audit purposes according to your OSVA data-retention policy.
