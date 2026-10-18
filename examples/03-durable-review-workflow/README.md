# 03 Durable review workflow

## What this teaches

This is an external-user version of the durable canonical lifecycle using only released public OSVA 1.0 contracts, SDK resources, Runtime Protocol helpers, and `/v1` APIs:

```text
Research agent
  -> Analysis agent
  -> Human approval
  -> Durable external-event wait
  -> Report agent
  -> Markdown artifact
```

The same REMOTE_HTTP AgentVersion is reused at the three AGENT nodes to keep the example compact. It evolves a JSON envelope: first it adds deterministic research, then analysis, then after approval/event pass-through it creates a Markdown artifact through the public runtime artifact capability.

No paid model or third-party account is required.

## Prerequisites

- Node.js 24+ and pnpm 12.4.1
- OSVA OSS 1.0.0 web, worker, workflow orchestrator, PostgreSQL/Valkey transport, and compatible artifact storage
- An API key that can create agents/workflows, execute workflow runs, decide approvals, emit workflow events, and read artifacts/observability
- Worker reachability to `OSVA_REVIEW_RUNTIME_URL`

For a deliberately local private REMOTE_HTTP target, the stable OSVA worker requires the operator opt-in `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true`. Keep it disabled in production unless explicitly justified.

## Configure

Export `.env.example` values. Required: `OSVA_BASE_URL`, `OSVA_API_KEY`, and `OSVA_REVIEW_RUNTIME_URL`.

The local runtime listens on loopback port 8790 by default. If OSVA runs inside a container, the worker needs a URL that actually reaches the host/runtime; its own `127.0.0.1` is not the host machine.

Human approval is interactive by default. For a deliberate non-interactive demo only, `OSVA_AUTO_APPROVE=true` submits an approval automatically.

## Build and run

From the repository root:

```bash
pnpm install
pnpm --filter @osva-examples/03-durable-review-workflow build
pnpm example:03
```

The client performs these public operations in order:

1. Starts the local Runtime Protocol server.
2. Registers an Agent and immutable AgentVersion.
3. Registers a Workflow and V3 WorkflowVersion.
4. Starts the WorkflowRun.
5. Polls until the pending ApprovalRequest appears, pauses for an interactive human decision, then submits that decision.
6. Polls until the EVENT WAIT node is armed.
7. POSTs the correlated event to `/v1/workflow-events`.
8. Polls to a terminal workflow state.
9. Reads the Markdown Artifact through the public artifact API and downloads it to `OSVA_ARTIFACT_OUTPUT_DIR`.
10. Reads child RunAttempts and stable run-step activity exposed for `MODEL`, `TOOL`, `MEMORY`, and `KNOWLEDGE` steps.

Polling at every asynchronous gate uses elapsed wall-clock deadlines. Timeout errors include the last observed workflow/node state and attempt count.

## Expected output shape

```json
{
  "workspaceId": "<workspace id>",
  "workflowRunId": "<workflow run id>",
  "approvalRequestId": "<approval id>",
  "eventId": "<workflow event id>",
  "status": "SUCCEEDED",
  "artifactId": "<artifact id>",
  "artifactPath": "<local output path>",
  "childRuns": [
    {
      "node": "research",
      "runId": "<child run id>",
      "attemptId": "<attempt id>",
      "steps": []
    }
  ]
}
```

The deterministic agents in this example do not invoke model/tool/knowledge capabilities, so their step arrays may be empty. If those public capabilities are added later, the same observability query reports their recorded run steps. Artifact creation is retrieved separately because ARTIFACT is not a stable 1.0 run-step kind.

## Common failures

- Workflow never leaves `PENDING`/`RUNNING`: verify worker and workflow-orchestrator processes plus their queue/Valkey configuration.
- Approval never appears: inspect node states and the research/analysis child RunAttempts.
- Event wait is never reached: inspect the approval decision and orchestrator logs.
- Event does not resume the workflow: source, event type, and correlation key must match the V3 WAIT contract.
- REMOTE_HTTP failure: verify worker reachability and the explicit local private-network opt-in.
- Artifact download failure: verify artifact storage is configured consistently for web and worker services.

## Cleanup

The runtime server is closed in a `finally` block. Remove the downloaded local artifact directory when finished:

```bash
rm -rf output
```

OSVA registry, workflow, run, event, approval, and artifact records are durable and are not deleted by this example because stable 1.0 does not expose a general deletion API for these resources.

## Stable-surface limitations

This example deliberately does not use current main/M11 identity features. Stable 1.0 supports the required V3 approval/event/artifact lifecycle, so no internal import is needed. Run-step observability covers `MODEL`, `TOOL`, `MEMORY`, and `KNOWLEDGE`; artifact capability calls are not a run-step kind and are therefore shown through the artifact API instead.
