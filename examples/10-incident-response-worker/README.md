# 10 Incident response worker

## What this teaches

This example models an employee-like **SRE / incident commander** on OSVA OSS 1.0. It triages alerts, collects synthetic infrastructure evidence, diagnoses probable causes with competing hypotheses, assesses severity with explicit rules, plans remediation, **requires human approval before state-changing tools**, executes simulated rollback/restart, **verifies recovery honestly**, branches on outcome, and publishes a post-incident Markdown report.

```text
Triage
  -> Collect diagnostics (4× MCP read tools)
  -> Diagnose + assess severity
  -> Plan remediation
  -> Human approval
  -> Execute simulated remediation (MCP write tools)
  -> Verify recovery
  -> BRANCH (/recoveryRoute)
       recovered -> incident report
       unresolved -> escalate -> incident report
```

Each stage is a separate V3 workflow node. One REMOTE_HTTP AgentVersion advances a structured JSON envelope. Diagnosis, severity, and remediation selection are **deterministic policy code**, not model discretion.

**V1 performs no real infrastructure operations.** All health, logs, deployments, and dependencies are in-memory fixtures. Rollback and restart mutate that fixture state only.

## Employee role and workflow nodes

| Node                    | Role                | Output                                  |
| ----------------------- | ------------------- | --------------------------------------- |
| `triage`                | Incident commander  | Scope, concerns, initial severity       |
| `collect-diagnostics`   | Evidence collector  | Health, logs, deployments, dependencies |
| `diagnose`              | SRE analyst         | Hypotheses + primary cause              |
| `assess-severity`       | Impact assessor     | Rule-based sev level                    |
| `plan-remediation`      | Remediation planner | Rollback / restart / monitor / escalate |
| `human-approval`        | Human operator      | Approve/reject before side effects      |
| `execute-remediation`   | Automation executor | Simulated rollback or restart           |
| `verify-recovery`       | Verification        | Re-check health + dependencies          |
| `recovery-branch`       | Workflow router     | `recovered` vs `unresolved`             |
| `escalate-incident`     | Escalation          | War-room style next steps               |
| `write-incident-report` | Reporter            | Markdown incident report artifact       |

## Synthetic fixture scenario

Default alert: **checkout-api error rate above 20% after deployment**.

Fixtures include:

- Degraded checkout-api metrics (23% errors)
- Logs correlating deployment `dep-442` with database pool exhaustion
- A misleading payments-api degradation signal (secondary symptom)
- Dependencies: postgres-primary degraded, payments-api degraded, cache/broker healthy
- Rollback restores healthy metrics; **restart alone does not** (failed recovery path for tests)

## MCP connector (`incident_ops`)

| Tool                     | Kind        | Purpose                         |
| ------------------------ | ----------- | ------------------------------- |
| `get_service_health`     | Read        | Service status, error rate      |
| `get_recent_logs`        | Read        | Structured log events           |
| `get_recent_deployments` | Read        | Active and historical deploys   |
| `get_dependency_health`  | Read        | Upstream/downstream health      |
| `rollback_deployment`    | Side effect | Simulated rollback (idempotent) |
| `restart_service`        | Side effect | Simulated restart (idempotent)  |

## Prerequisites

- Node.js 24+ and pnpm 12.4.1
- OSVA OSS 1.0.0 web, worker, workflow orchestrator, artifact storage
- API key with connector/tool, agent, workflow, approval, and artifact permissions
- Worker reachability to `OSVA_INCIDENT_MCP_CONNECTOR_URL` and `OSVA_INCIDENT_RUNTIME_URL`

Local development typically requires `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true` for loopback MCP/runtime URLs (ports **8803** MCP, **8804** runtime by default).

## Configure

Export values from `.env.example`. Required:

- `OSVA_BASE_URL`
- `OSVA_API_KEY`
- `OSVA_INCIDENT_MCP_CONNECTOR_URL`
- `OSVA_INCIDENT_RUNTIME_URL`

Optional input:

- `OSVA_INCIDENT_SERVICE` (default `checkout-api`)
- `OSVA_INCIDENT_ALERT_TYPE`
- `OSVA_INCIDENT_MESSAGE`

Interactive approval is default; use `OSVA_AUTO_APPROVE=true` only for scripted demos.

## Build and run

```bash
pnpm install
pnpm --filter @osva-examples/10-incident-response-worker build
pnpm example:10
```

## Expected output shape

```json
{
  "workspaceId": "<workspace id>",
  "workflowRunId": "<workflow run id>",
  "approvalRequestId": "<approval id>",
  "status": "SUCCEEDED",
  "artifactId": "<artifact id>",
  "artifactPath": "<local path>",
  "recovered": true,
  "childRuns": []
}
```

After approval, the default fixture path rolls back deployment `dep-442` and `recovered` should be `true`. If remediation were restart-only, verification would fail and the workflow would escalate before still writing the report.

## Observability

MCP handlers emit structured stderr events (`mcp.get_service_health.invoked`, etc.). The runtime envelope preserves evidence IDs, diagnosis, approval summary, remediation result, and recovery checks for inspection in workflow node output.

## Limitations and future integrations

This example does not call Kubernetes, cloud control planes, Datadog, Grafana, Prometheus, PagerDuty, Sentry, GitHub Deployments, Slack, or incident platforms. Wire those systems by replacing the MCP connector implementations while keeping the same workflow stages, approval boundary, and verification pattern.

## Tests

```bash
pnpm --filter @osva-examples/10-incident-response-worker test
```

Smoke tests cover validation, MCP tools, diagnosis, severity rules, approval placement, idempotent remediation, recovery success/failure, escalation metadata, report sections, workflow BRANCH, and manifest bindings.
