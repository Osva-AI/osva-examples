# 19 Research & Report Agent

## What this demonstrates

Single **Research & Report** agent for **OSVA Community 1.1.x** that:

1. Accepts an npm package name.
2. Calls MCP tools `npm_package_metadata` and (optionally) `npm_downloads`.
3. Invokes a bound model through OSVA ModelGateway.
4. Persists a Markdown research report via `context.artifacts.create`.
5. Returns structured output plus **MODEL** / **TOOL** run-step observability.
6. Supports a **deterministic fixture package** and **EvaluationSuite** case for reproducible acceptance.

```text
packageName (+ includeDownloads)
        |
        v
MCP: npm_package_metadata  -->  optional npm_downloads
        |
        v
ModelGateway (research_model binding)
        |
        v
Structured synthesis + Markdown artifact
        |
        v
Run result + artifact reference (+ optional EvaluationRun)
```

## Compatibility (this example only)

| Component                | Version |
| ------------------------ | ------- |
| OSVA OSS                 | `1.1.x` |
| `@osva-ai/sdk`           | `1.1.2` |
| `@osva-ai/contracts`     | `1.1.2` |
| `@osva-ai/connector-sdk` | `1.1.2` |

The repository-wide baseline in [COMPATIBILITY.md](../../COMPATIBILITY.md) remains **1.0.0**; only this example targets 1.1.x APIs (evaluations, run observability resource, TRUSTED_TYPESCRIPT manifest).

**SDK note:** `@osva-ai/sdk@1.1.2` on npm includes `evaluationSuites`, `evaluationRuns`, and `runObservability`, but not yet the M17.2 `client.modelProfiles` / `client.connectors` helpers merged on `osva/main`. This example uses `OsvaHttpClient` for `/v1/model-profiles` and `/v1/connectors` (same pattern as examples 02 and 12).

## npm MCP connector packaging

There is **no published npm package** for the canonical connector today. Tool names and behavior align with:

`Osva-AI/osva` → `examples/canonical-dependency-adoption/mcp/npm-connector`

This example vendors a **read-only copy** under `src/connector/` (~530 lines: `npm-client.ts`, `schemas.ts`, `connector.ts`, plus HTTP/STDIO entrypoints) for external reproducibility. It preserves canonical tool names, input schemas, and npm host allowlisting from the upstream connector. There is no published `@osva-ai/*` npm connector package to depend on today; **M17.4** may extract or publish one from `osva-connectors`. Until then, sync from upstream when the canonical connector changes.

## Runtime modes

| Mode                      | When                            | Notes                                                                                                                                                                                           |
| ------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **REMOTE_HTTP** (default) | Local demo                      | Starts Streamable HTTP MCP + REMOTE_HTTP runtime on loopback (like examples 02 + 12).                                                                                                           |
| **TRUSTED_TYPESCRIPT**    | `OSVA_TRUSTED_RUNTIME_ROOT` set | Copies built `dist/` into the worker trusted runtime root, registers `TRUSTED_TYPESCRIPT` manifest with `sha256:` integrity, uses **STDIO** MCP (`dist/connector/stdio.js`) on the worker host. |

Trusted deployment requires the OSVA worker to read from the configured trusted runtime root and to spawn the documented STDIO MCP command. Run `pnpm build` and bootstrap from a host whose paths match what the **worker** can execute (absolute `node` + `dist/connector/stdio.js` in connector version config). Provider credentials remain in server/worker configuration only.

## Prerequisites

- Node.js 24+ and pnpm 12.4.1
- OSVA **1.1.x** web + worker for live runs
- API key with agent, run, connector, tool, model, artifact, and evaluation permissions
- ModelProfileVersion with provider credentials configured on the deployment
- For loopback REMOTE_HTTP/MCP: documented private-network opt-ins on the OSVA deployment:

```text
OSVA_MCP_CONNECTOR_ALLOW_PRIVATE_NETWORKS=true
OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true
```

## Configure

Copy `.env.example` and export variables in your shell (tests do not auto-load `.env`).

| Variable                         | Required           | Purpose                                             |
| -------------------------------- | ------------------ | --------------------------------------------------- |
| `OSVA_BASE_URL`                  | Live               | OSVA API base URL                                   |
| `OSVA_API_KEY`                   | Live               | Bearer API key                                      |
| `OSVA_AGENT_RUNTIME_URL`         | REMOTE_HTTP live   | Worker-reachable `/execute` URL                     |
| `OSVA_MCP_CONNECTOR_URL`         | REMOTE_HTTP live   | Worker-reachable MCP `/mcp` URL                     |
| `OSVA_MODEL_PROFILE_VERSION_ID`  | Live (recommended) | Existing ModelProfileVersion                        |
| `OSVA_EXAMPLE_PACKAGE_NAME`      | Optional           | Default `lodash`                                    |
| `OSVA_EXAMPLE_INCLUDE_DOWNLOADS` | Optional           | Default `true`                                      |
| `OSVA_RUN_EVALUATION`            | Optional           | When `true`, runs EvaluationSuite after fixture run |
| `OSVA_TRUSTED_RUNTIME_ROOT`      | Trusted mode       | Worker trusted runtime directory                    |

Never commit provider secrets. Do not pass credentials in run input, artifacts, or logs.

## Run

```bash
pnpm install
pnpm --filter @osva-examples/19-research-report-agent build
pnpm example:19
```

Deterministic offline tests (no API key, no live npm, no LLM):

```bash
pnpm --filter @osva-examples/19-research-report-agent test
```

### Evaluation evidence (three levels)

| Level                      | What runs                                                                                                     | CI?            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------- |
| **Local fixture agent**    | `pnpm test` — fixture package + mocked artifact                                                               | Yes            |
| **Local summary check**    | `assertFixtureOutputMatchesEvaluation()` on demo fixture runs (stable fields only; ignores live `artifactId`) | Yes (in tests) |
| **Platform EvaluationRun** | Optional live: `OSVA_RUN_EVALUATION=true`                                                                     | Manual only    |

**Offline acceptance:** `pnpm --filter @osva-examples/19-research-report-agent test` proves fixture execution and that the EvaluationSuite case definition matches stable agent output for run key `evaluation-fixture`.

**Optional live platform evaluation** (requires OSVA 1.1.x deployment):

```text
OSVA_EXAMPLE_PACKAGE_NAME=osva-examples-fixture-research
OSVA_RUN_EVALUATION=true
```

This registers an EvaluationSuite, starts an EvaluationRun against the created AgentVersion, and polls case results. Platform `JSON_EXACT_MATCH` compares the **entire** run output JSON. Evaluation runs use input `runKey: evaluation-fixture`, which returns a fully stable structured object (synthetic artifact id `artifact_eval_fixture`; **no** Markdown artifact is persisted for that evaluation run). Demo runs with a normal `runKey` still create and download a real artifact.

Expect `evaluation.passed: true` in the printed JSON when the deployment supports evaluation APIs and the agent version matches the suite case.

## Artifact retrieval

On success, the example downloads the Markdown artifact through `client.artifacts.download` and writes it under `./output/` relative to the example working directory.

## Troubleshooting

| Symptom                                   | Likely cause                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| MCP discovery fails                       | Worker cannot reach MCP URL, private-network policy, or wrong `/mcp` path |
| MODEL step fails                          | Missing/invalid ModelProfileVersion provider credentials on deployment    |
| `PACKAGE_NOT_FOUND` tool error            | Unknown npm package name                                                  |
| Trusted mode fails to start               | Trusted bundle not deployed on worker host or integrity mismatch          |
| Evaluation case fails on live LLM package | Use the fixture package for deterministic evaluation                      |

## Security limitations

- MCP connector allows outbound HTTPS only to official npm registry/download hosts (see `npm-client.ts`).
- OSVA private-network MCP/REMOTE_HTTP access is off by default; enable only for local development.
- Treat registry metadata and model output as untrusted when rendering reports.

## Limitations

- Published `@osva-ai/sdk` does not yet expose typed connector/model registry clients from M17.2; REST bootstrap is intentional.
- Live evaluation against real packages depends on non-deterministic model text; use the fixture package and `evaluation-fixture` run key for platform evaluation.
- `evaluation-fixture` runs intentionally skip artifact persistence so `JSON_EXACT_MATCH` stays stable; use a normal demo run to verify ArtifactStore.
- Registry re-import on repeated bootstrap may create additional tool versions (OSVA registry immutability).
