# 14 Parallel research agents

## What this demonstrates

Native **Workflow V3 `PARALLEL` / `JOIN` orchestration** with three concurrent AGENT branch runs (market, competitor, customer), deterministic fixture research, branch traceability, synthesis, and a Markdown report artifact.

```text
Research question
       ↓
   plan (AGENT)
       ↓
   PARALLEL fan-out
   ↙     ↓     ↘
market competitor customer   ← separate AgentVersions / REMOTE_HTTP routes
   ↘     ↓     ↙
      JOIN
       ↓
  synthesize (AGENT)
       ↓
   report (AGENT + artifact)
```

## OSVA primitives used

| Primitive                       | Role                                                 |
| ------------------------------- | ---------------------------------------------------- |
| Workflow V3 `PARALLEL` / `JOIN` | True fan-out / join (not sequential nodes)           |
| Multiple AGENT node runs        | One canonical Run per branch                         |
| REMOTE_HTTP runtimes            | Path-routed branch endpoints                         |
| Workflow run polling            | `@osva-ai/sdk` `workflowRuns`                        |
| Artifacts                       | Report node creates Markdown via `context.artifacts` |

## Branch identity note (OSVA 1.0)

The public runtime execute contract exposes run `input`, not workflow node keys. This example uses **distinct AgentVersion endpoints** (`/execute/market`, `/execute/competitor`, `/execute/customer`) so each parallel branch executes the correct logic without inventing orchestrator-only fields.

## Offline vs live

| Mode          | Behavior                                                              |
| ------------- | --------------------------------------------------------------------- |
| Offline tests | Workflow schema, fixtures, synthesis, runtime envelope (no OSVA)      |
| Live          | Registers workflow + six AgentVersions, runs WorkflowRun against OSVA |

## Prerequisites

- Node.js 24+, pnpm 12.4.1
- OSVA OSS 1.0.0 with workflow orchestrator enabled
- Worker reachability to `OSVA_PARALLEL_RUNTIME_BASE_URL` (private-network opt-in for loopback)

## Environment variables

See `.env.example`. Set `OSVA_PARALLEL_RUNTIME_BASE_URL` to the runtime base (for example `http://127.0.0.1:8795`).

## How to run

```bash
pnpm install
pnpm --filter @osva-examples/14-parallel-research-agents build
pnpm example:14
```

## Expected observability

- Workflow node runs for `fan-out` (PARALLEL) and `join-branches` (JOIN)
- Three branch AGENT nodes with distinct `childRunId` values
- Final report node output containing an artifact reference

## Limitations

- Branch routing relies on per-branch REMOTE_HTTP endpoints rather than a single shared endpoint.
- Fixture corpus only — no live web research.
- Parallel scheduling semantics (exact concurrency timing) depend on the OSVA orchestrator deployment.

## Security notes

- No external credentials; fixture data only.
- Do not expose runtime servers on public interfaces.
