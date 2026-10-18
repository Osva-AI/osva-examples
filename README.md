# OSVA Examples

`osva-examples` is a public, external-consumer repository for learning, evaluating, and adopting [OSVA](https://github.com/Osva-AI/osva). It is deliberately separate from the primary platform repository and uses released public packages and authenticated public APIs only.

The current compatibility baseline is **OSVA OSS 1.0.0**. See [COMPATIBILITY.md](COMPATIBILITY.md).

## Prerequisites

- Node.js 24 or newer
- pnpm 12.4.1
- A compatible OSVA OSS 1.0 deployment for live runs
- An OSVA API key created through the supported bootstrap/API-key flow

Install dependencies:

```bash
corepack enable
corepack prepare pnpm@12.4.1 --activate
pnpm install
```

## Examples

| Example                                                                     | Learning goal                                                                                                                  | Live prerequisites                                                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| [01 Minimal agent run](examples/01-minimal-agent/README.md)                 | Start an existing AgentVersion, poll with a wall-clock deadline, and report the final attempt result                           | OSVA endpoint, API key, Agent and AgentVersion IDs                                                        |
| [02 MCP tool-enabled agent](examples/02-mcp-tool-agent/README.md)           | Register a safe MCP connector over public APIs, bind its tool to a REMOTE_HTTP agent, execute it, and inspect TOOL activity    | OSVA services plus local connector/runtime reachability and private-network opt-ins for local development |
| [03 Durable review workflow](examples/03-durable-review-workflow/README.md) | Run AGENT → AGENT → APPROVAL → EVENT WAIT → AGENT, emit the event, create Markdown, and download the artifact                  | OSVA web, worker, workflow orchestrator, runtime reachability, artifact storage                           |
| [04 SEO worker](examples/04-seo-worker/README.md)                           | Run inspect (MCP) → analyze → APPROVAL → report, produce a prioritized Markdown SEO audit from fixture-backed page data        | OSVA web, worker, workflow orchestrator, MCP + runtime reachability, artifact storage                     |
| [05 Research analyst worker](examples/05-research-analyst-worker/README.md) | Run plan → collect (MCP) → extract → analyze → review → APPROVAL → report with evidence traceability and conflict handling     | OSVA web, worker, workflow orchestrator, MCP + runtime reachability, artifact storage                     |
| [06 Customer support worker](examples/06-customer-support-worker/README.md) | Run classify → lookup (MCP) → policy → BRANCH → approval/action/escalation → customer response with demo refunds/cancellations | OSVA web, worker, workflow orchestrator, MCP + runtime reachability                                       |
| [07 Growth analyst worker](examples/07-growth-analyst-worker/README.md)     | Run collect metrics (MCP) → funnel analysis → opportunities → experiments → prioritize → APPROVAL → growth brief artifact      | OSVA web, worker, workflow orchestrator, MCP + runtime reachability, artifact storage                     |
| [08 Product manager worker](examples/08-product-manager-worker/README.md)   | Run collect evidence (MCP) → cluster → prioritize → draft → review → APPROVAL → product brief artifact                         | OSVA web, worker, workflow orchestrator, MCP + runtime reachability, artifact storage                     |

## Quick start

Copy an example's `.env.example` to `.env`, replace placeholder values, export the variables in your shell, then run its workspace command. This repository intentionally does not auto-load developer `.env` files in tests.

```bash
pnpm example:01
pnpm example:02
pnpm example:03
pnpm example:04
pnpm example:05
pnpm example:06
pnpm example:07
pnpm example:08
```

Each example README contains its exact prerequisites, environment variables, expected output shape, common failures, and cleanup steps.

## Running against a local OSVA deployment

For the basic example, `OSVA_BASE_URL=http://127.0.0.1:8080` is typical for the default self-hosted web port. Supply the API key through `OSVA_API_KEY`; do not put it in source, prompts, or workflow input.

Examples 02 and 03 start local REMOTE_HTTP/MCP endpoints. OSVA blocks private-network destinations by default. If the OSVA worker is allowed to call those local endpoints for development, enable only the documented OSVA private-network opt-ins in the OSVA deployment and keep them disabled in production unless your threat model explicitly permits the access. Containerized OSVA deployments may also require a network address that is reachable from the worker instead of `127.0.0.1`.

## Verification

Offline verification does not require an API key or paid external service:

```bash
pnpm format
pnpm verify
```

CI performs a clean install, formatting check, lint, typecheck, hermetic smoke/contract tests, build validation, documentation-link validation, a lightweight secret scan, and whitespace checks. Live OSVA execution remains an explicit local/manual step because CI has no assumed deployment or credential.

## Public interfaces only

Examples may depend on released `@osva-ai/*` packages and stable authenticated `/v1` APIs. They must not import sibling OSVA source files, internal adapters, database packages, `@osva/domain`, or unfinished platform internals.

## Issues and security

Use repository issues for example bugs and documentation problems. For security issues, follow [SECURITY.md](SECURITY.md) and do not disclose vulnerabilities publicly.

## License

Apache License 2.0. See [LICENSE](LICENSE).
