# Compatibility baseline

This repository targets the stable **OSVA OSS 1.0.0** public surface. It intentionally does not target the current 1.1 prerelease or unfinished identity/workspace work on OSVA main.

| Component                   | Tested/targeted version |
| --------------------------- | ----------------------- |
| OSVA OSS release            | `1.0.0`                 |
| `@osva-ai/sdk`              | `1.0.0`                 |
| `@osva-ai/contracts`        | `1.0.0`                 |
| `@osva-ai/runtime-protocol` | `1.0.0`                 |
| `@osva-ai/connector-sdk`    | `1.0.0`                 |
| `@osva-ai/cli`              | `1.0.0`                 |
| Node.js                     | `>=24`                  |
| pnpm                        | `12.4.1`                |

## Feature requirements

- Example 01 requires an existing executable AgentVersion and the authenticated `/v1` Run APIs.
- Example 02 requires Connector Profile V1, MCP discovery/import, REMOTE_HTTP runtime execution, runtime Tool capability forwarding, and run-step observability.
- Example 03 requires Workflow Definition V3, APPROVAL, durable EVENT WAIT, WorkflowEvent ingestion, REMOTE_HTTP runtime execution, and runtime artifact creation/download.

## Stable 1.0 public-surface notes

The TypeScript SDK exposes agents, runs, workflows, workflow runs, approvals, artifacts, and other core resources. Connector and tool registry setup is available through authenticated stable `/v1` REST routes but does not have dedicated `OsvaClient` resource properties in SDK 1.0. Example 02 therefore uses the public `OsvaHttpClient` for those routes.

The stable CLI help text mentions `OSVA_WORKSPACE_ID`, while SDK/API create operations bind requests to the workspace represented by the API-key principal. These examples do not rely on unfinished identity behavior. They read `/v1/auth/context` only when workspace context is useful for display and diagnostics.

Run-step observability records `MODEL`, `TOOL`, `MEMORY`, and `KNOWLEDGE` activity. Artifact creation is retrieved through the artifact API rather than represented as a run-step kind.

Private-network destinations are disabled by default in OSVA. Live local examples that expose an MCP connector or REMOTE_HTTP runtime to an OSVA worker require explicit operator configuration such as `OSVA_MCP_CONNECTOR_ALLOW_PRIVATE_NETWORKS=true` and/or `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true`. Those are local-development opt-ins, not production defaults.
