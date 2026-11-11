# Compatibility baseline

This repository ships **two documented dependency tracks**. They target different OSVA platform lines and are verified independently.

| Track                | OSVA platform                                     | npm packages                                                                                                  | Examples  | Verification                                                                                                                                      |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Legacy (default)** | **1.0.0** OSS                                     | `@osva-ai/*` **1.0.0** (see matrix)                                                                           | **01–18** | Root `pnpm verify` (typecheck, hermetic tests, build)                                                                                             |
| **1.1.x consumer**   | **1.1.x** OSS (live acceptance targets **1.1.1**) | `@osva-ai/sdk`, `@osva-ai/contracts`, `@osva-ai/connector-sdk` **1.1.4**; connectors per example (see matrix) | **19–21** | Example 19–21 tests; [M19.2 harness](docs/M19_2_EXTERNAL_CONSUMER_ACCEPTANCE.md) (Example 19); B6.2 pin + npm install acceptance (Examples 20–21) |

Do not assume Examples **01–18** work against OSVA **1.1.x** deployments without a dedicated migration and live acceptance pass. Examples **19–21** are the supported **1.1.x consumer** track for published connector integration.

## Recommended starting points

| Your deployment                                       | Start here                                                                          | Why                                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| OSVA OSS **1.0.0**                                    | [Example 01 — Minimal agent run](examples/01-minimal-agent/README.md)               | Smallest run/poll surface; matches the legacy npm pins used by Examples 01–18.                                 |
| OSVA OSS **1.1.x** (new adopters, npm-only consumers) | [Example 19 — Research & report agent](examples/19-research-report-agent/README.md) | Typed SDK resources for connectors, tools, and model profiles; evaluations; M19.2 npm-only installation proof. |

Migrating from 1.0.0 examples to 1.1.x: see [docs/MIGRATION_1_0_TO_1_1.md](docs/MIGRATION_1_0_TO_1_1.md).

## Legacy track package baseline (Examples 01–18)

| Component                   | Version                                              |
| --------------------------- | ---------------------------------------------------- |
| OSVA OSS release            | `1.0.0`                                              |
| `@osva-ai/sdk`              | `1.0.0`                                              |
| `@osva-ai/contracts`        | `1.0.0`                                              |
| `@osva-ai/runtime-protocol` | `1.0.0` (Examples 13–14 only)                        |
| `@osva-ai/connector-sdk`    | `1.0.0` (Examples 02, 04–11 only)                    |
| `@osva-ai/cli`              | `1.0.0` (not a runtime dependency in these examples) |
| `@osva-examples/utils`      | workspace; depends on `@osva-ai/contracts` **1.0.0** |
| Node.js                     | `>=24`                                               |
| pnpm                        | `12.4.1`                                             |

## Example dependency matrix

| Example | Folder                         | SDK track | `@osva-ai/sdk` | `@osva-ai/contracts` | `@osva-ai/connector-sdk` | `@osva-ai/runtime-protocol` | `@osva-ai/connector-npm` | `@osva-ai/connector-github` | `@osva-ai/connector-shopify` | `@osva-ai/connector-ga4` |
| ------- | ------------------------------ | --------- | -------------- | -------------------- | ------------------------ | --------------------------- | ------------------------ | --------------------------- | ---------------------------- | ------------------------ |
| 01      | `01-minimal-agent`             | Legacy    | 1.0.0          | 1.0.0                | —                        | —                           | —                        | —                           | —                            | —                        |
| 02      | `02-mcp-tool-agent`            | Legacy    | 1.0.0          | 1.0.0                | 1.0.0                    | —                           | —                        | —                           | —                            | —                        |
| 03      | `03-durable-review-workflow`   | Legacy    | 1.0.0          | 1.0.0                | —                        | —                           | —                        | —                           | —                            | —                        |
| 04      | `04-seo-worker`                | Legacy    | 1.0.0          | 1.0.0                | 1.0.0                    | —                           | —                        | —                           | —                            | —                        |
| 05      | `05-research-analyst-worker`   | Legacy    | 1.0.0          | 1.0.0                | 1.0.0                    | —                           | —                        | —                           | —                            | —                        |
| 06      | `06-customer-support-worker`   | Legacy    | 1.0.0          | 1.0.0                | 1.0.0                    | —                           | —                        | —                           | —                            | —                        |
| 07      | `07-growth-analyst-worker`     | Legacy    | 1.0.0          | 1.0.0                | 1.0.0                    | —                           | —                        | —                           | —                            | —                        |
| 08      | `08-product-manager-worker`    | Legacy    | 1.0.0          | 1.0.0                | 1.0.0                    | —                           | —                        | —                           | —                            | —                        |
| 09      | `09-founders-office-worker`    | Legacy    | 1.0.0          | 1.0.0                | 1.0.0                    | —                           | —                        | —                           | —                            | —                        |
| 10      | `10-incident-response-worker`  | Legacy    | 1.0.0          | 1.0.0                | 1.0.0                    | —                           | —                        | —                           | —                            | —                        |
| 11      | `11-growth-operations-worker`  | Legacy    | 1.0.0          | 1.0.0                | 1.0.0                    | —                           | —                        | —                           | —                            | —                        |
| 12      | `12-model-powered-agent`       | Legacy    | 1.0.0          | 1.0.0                | —                        | —                           | —                        | —                           | —                            | —                        |
| 13      | `13-remote-python-agent`       | Legacy    | 1.0.0          | 1.0.0                | —                        | 1.0.0                       | —                        | —                           | —                            | —                        |
| 14      | `14-parallel-research-agents`  | Legacy    | 1.0.0          | 1.0.0                | —                        | 1.0.0                       | —                        | —                           | —                            | —                        |
| 15      | `15-scheduled-reporting-agent` | Legacy    | 1.0.0          | 1.0.0                | —                        | —                           | —                        | —                           | —                            | —                        |
| 16      | `16-knowledge-rag-agent`       | Legacy    | 1.0.0          | 1.0.0                | —                        | —                           | —                        | —                           | —                            | —                        |
| 17      | `17-github-automation-agent`   | Legacy    | 1.0.0          | 1.0.0                | —                        | —                           | —                        | —                           | —                            | —                        |
| 18      | `18-failure-recovery`          | Legacy    | 1.0.0          | 1.0.0                | —                        | —                           | —                        | —                           | —                            | —                        |
| 19      | `19-research-report-agent`     | **1.1.x** | **1.1.4**      | **1.1.4**            | **1.1.4**                | —                           | **0.1.1**                | —                           | —                            | —                        |
| 20      | `20-github-repository-analyst` | **1.1.x** | **1.1.4**      | **1.1.4**            | **1.1.4**                | —                           | —                        | **0.4.0**                   | —                            | —                        |
| 21      | `21-commerce-growth-analyst`   | **1.1.x** | **1.1.4**      | **1.1.4**            | **1.1.4**                | —                           | —                        | —                           | **0.1.1**                    | **0.1.1**                |

Published npm versions verified for the 1.1.x track (registry, **2026-11-12**): `@osva-ai/sdk` / `contracts` / `connector-sdk` **`1.1.4`**; `@osva-ai/connector-npm` **`0.1.1`** (Example **19**); `@osva-ai/connector-github` **`0.4.0`** (Example **20**, read-only tool bindings only); `@osva-ai/connector-shopify` **`0.1.1`** and `@osva-ai/connector-ga4` **`0.1.1`** (Example **21**, dual STDIO MCP, read-only imports only).

M19 ecosystem closeout (platform **1.1.1**, live registry acceptance **`m17-114`**, **38/38 PASS**): [Osva-AI/osva `M19_CLOSEOUT_SUMMARY.md`](https://github.com/Osva-AI/osva/blob/main/docs/operations/M19_CLOSEOUT_SUMMARY.md).

## Feature requirements (legacy track)

- Example 01 requires an existing executable AgentVersion and the authenticated `/v1` Run APIs.
- Example 02 requires Connector Profile V1, MCP discovery/import, REMOTE_HTTP runtime execution, runtime Tool capability forwarding, and run-step observability.
- Example 03 requires Workflow Definition V3, APPROVAL, durable EVENT WAIT, WorkflowEvent ingestion, REMOTE_HTTP runtime execution, and runtime artifact creation/download.

## Feature requirements (1.1.x track — Examples 19–21)

- OSVA **1.1.x** web + worker with connector registry, runtime execution, and run-step observability.
- Example **19**: model gateway, artifact storage, (optional) evaluation APIs; **`@osva-ai/connector-npm@0.1.1`** (STDIO on worker; optional local Streamable HTTP bridge for loopback demos).
- Example **20**: **`@osva-ai/connector-github@0.4.0`** (STDIO only; read-only MCP tool imports); deterministic analysis without model binding.
- Example **21**: **`@osva-ai/connector-shopify@0.1.1`** + **`@osva-ai/connector-ga4@0.1.1`** (independent STDIO MCP processes); six read-only tool imports on one `AgentVersion`; multi-source commerce brief without model binding.
- Agent manifest kinds including **TRUSTED_TYPESCRIPT** when using trusted runtime mode.
- Typed SDK: `client.connectors` discovery/import, `client.agents`, `client.runs`, `client.runObservability` (Example 19 adds `client.modelProfiles` and evaluations).

## Stable 1.0 public-surface notes

The TypeScript SDK exposes agents, runs, workflows, workflow runs, approvals, artifacts, and other core resources. Connector and tool registry setup is available through authenticated stable `/v1` REST routes but does not have dedicated `OsvaClient` resource properties in SDK **1.0.0**. Examples **02** and **04–11** therefore use the public `OsvaHttpClient` for those routes.

The stable CLI help text mentions `OSVA_WORKSPACE_ID`, while SDK/API create operations bind requests to the workspace represented by the API-key principal. Legacy examples do not rely on unfinished identity behavior. They read `/v1/auth/context` only when workspace context is useful for display and diagnostics.

Run-step observability records `MODEL`, `TOOL`, `MEMORY`, and `KNOWLEDGE` activity. Artifact creation is retrieved through the artifact API rather than represented as a run-step kind.

Private-network destinations are disabled by default in OSVA. Live local examples that expose an MCP connector or REMOTE_HTTP runtime to an OSVA worker require explicit operator configuration such as `OSVA_MCP_CONNECTOR_ALLOW_PRIVATE_NETWORKS=true` and/or `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true`. Those are local-development opt-ins, not production defaults.

## 1.1.x track notes (Examples 19–21)

- Bootstrap prefers typed SDK connector clients instead of raw `OsvaHttpClient` for registry setup (see Example 19/20 `src/bootstrap.ts`).
- **`@osva-ai/connector-npm@0.1.1`** does not ship a Streamable HTTP server; Example 19 includes a thin local HTTP bridge for loopback REMOTE_HTTP demos only.
- **`@osva-ai/connector-github@0.4.0`** is STDIO-only; Example 20 never registers HTTP MCP for GitHub and imports only `github.repository.get`, `github.issue.list`, and `github.issue.get`.
- M19.2 installation acceptance uses **`npm install`** (not pnpm) and forbids monorepo `workspace:*` links in the materialized Example 19 consumer; see [docs/M19_2_EXTERNAL_CONSUMER_ACCEPTANCE.md](docs/M19_2_EXTERNAL_CONSUMER_ACCEPTANCE.md).
- B6.2: `pnpm acceptance:b6-2-pins` validates Example 20–21 published dependency pins (offline). `pnpm acceptance:b6-2-install` materializes Examples 20–21 outside the monorepo and runs `npm install` + hermetic tests (offline npm consumer proof — not live OSVA execution).

## Upgrade policy

Examples **01–18** remain pinned to the **legacy 1.0.0** npm line so existing OSVA **1.0.0** operators and CI stay stable. Bumping them to **1.1.4** requires per-example live acceptance on OSVA **1.1.x**, shared `@osva-examples/utils` contract alignment, and explicit matrix updates. Representative local spikes (TypeScript + hermetic vitest only) passed for Examples **01**, **02**, and **12** when dependencies were temporarily set to **1.1.4**; that is **not** sufficient to certify the full legacy catalog on **1.1.x**.

Automated enforcement: `pnpm verify:compatibility` (also part of `pnpm verify`).
