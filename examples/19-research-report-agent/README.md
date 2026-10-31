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
| `@osva-ai/sdk`           | `1.1.3` |
| `@osva-ai/contracts`     | `1.1.3` |
| `@osva-ai/connector-sdk` | `1.1.3` |
| `@osva-ai/connector-npm` | `0.1.0` |

The repository-wide baseline in [COMPATIBILITY.md](../../COMPATIBILITY.md) remains **1.0.0**; only this example targets 1.1.x APIs (evaluations, run observability resource, TRUSTED_TYPESCRIPT manifest).

Bootstrap uses typed SDK resources: `client.modelProfiles`, `client.connectors`, and `client.tools` (via connector import).

## npm MCP connector

Tool names and behavior come from the published package **`@osva-ai/connector-npm@0.1.0`** (`npm_package_metadata`, `npm_downloads`). The example does not vendor npm registry client logic.

| Transport           | Package support | This example                                                                  |
| ------------------- | --------------- | ----------------------------------------------------------------------------- |
| **STDIO**           | Yes (primary)   | Trusted mode; optional REMOTE_HTTP via `OSVA_MCP_CONNECTOR_STDIO=true`        |
| **Streamable HTTP** | No binary       | Thin local bridge in `src/connector/mcp-http.ts` using `createNpmConnector()` |

The HTTP bridge exists only for the default loopback REMOTE_HTTP demo so the OSVA worker can reach MCP over `OSVA_MCP_CONNECTOR_URL`. It reuses the published connector implementation; it is not a second copy of npm API logic.

### Worker installation (STDIO)

Install `@osva-ai/connector-npm@0.1.0` on the **worker host** (or set `OSVA_MCP_CONNECTOR_STDIO_COMMAND` / `OSVA_MCP_CONNECTOR_STDIO_ARGS_JSON` to a worker-reachable `node` + `stdio.js` path). The published binary is `osva-connector-npm`.

STDIO MCP requires explicit OSVA worker opt-in (see OSVA docs for MCP STDIO allowlists). Do not enable private network or STDIO in production without a threat-model review.

## Runtime modes

| Mode                      | Agent runtime      | MCP transport (typical)                    | Notes                                                                                       |
| ------------------------- | ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **REMOTE_HTTP** (default) | REMOTE_HTTP        | Streamable HTTP (local bridge)             | Starts loopback MCP + `/execute` runtime (like examples 02 + 12).                           |
| **REMOTE_HTTP + STDIO**   | REMOTE_HTTP        | STDIO (worker-spawned published connector) | Set `OSVA_MCP_CONNECTOR_STDIO=true`; worker must spawn connector; no local MCP HTTP server. |
| **TRUSTED_TYPESCRIPT**    | TRUSTED_TYPESCRIPT | STDIO (`@osva-ai/connector-npm` entry)     | `OSVA_TRUSTED_RUNTIME_ROOT` set; copies built agent into worker trusted runtime root.       |

Agent runtime and MCP transport are independent: REMOTE_HTTP execution with STDIO MCP is supported when the worker is configured for STDIO.

Trusted deployment requires the OSVA worker to read from the configured trusted runtime root and to spawn the documented STDIO MCP command. Bootstrap resolves the published `stdio.js` from this example’s `node_modules` unless you override with `OSVA_MCP_CONNECTOR_STDIO_*`. Paths in connector version config must be executable **on the worker host**, not only on your laptop.

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

For worker STDIO: documented MCP STDIO opt-in on the worker.

## Configure

Copy `.env.example` and export variables in your shell (tests do not auto-load `.env`).

| Variable                             | Required           | Purpose                                                    |
| ------------------------------------ | ------------------ | ---------------------------------------------------------- |
| `OSVA_BASE_URL`                      | Live               | OSVA API base URL                                          |
| `OSVA_API_KEY`                       | Live               | Bearer API key                                             |
| `OSVA_AGENT_RUNTIME_URL`             | REMOTE_HTTP live   | Worker-reachable `/execute` URL                            |
| `OSVA_MCP_CONNECTOR_URL`             | REMOTE_HTTP + HTTP | Worker-reachable MCP `/mcp` URL (default loopback demo)    |
| `OSVA_MCP_CONNECTOR_STDIO`           | Optional           | When `true`, register STDIO MCP (worker-spawned connector) |
| `OSVA_MCP_CONNECTOR_STDIO_COMMAND`   | Optional           | Override STDIO executable (worker-reachable)               |
| `OSVA_MCP_CONNECTOR_STDIO_ARGS_JSON` | Optional           | JSON string array of STDIO args                            |
| `OSVA_MODEL_PROFILE_VERSION_ID`      | Live (recommended) | Existing ModelProfileVersion                               |
| `OSVA_EXAMPLE_PACKAGE_NAME`          | Optional           | Default `lodash`                                           |
| `OSVA_EXAMPLE_INCLUDE_DOWNLOADS`     | Optional           | Default `true`                                             |
| `OSVA_RUN_EVALUATION`                | Optional           | When `true`, runs EvaluationSuite after fixture run        |
| `OSVA_TRUSTED_RUNTIME_ROOT`          | Trusted mode       | Worker trusted runtime directory                           |

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
| STDIO discovery fails                     | Worker STDIO disabled, connector not installed on worker, or bad paths    |
| MODEL step fails                          | Missing/invalid ModelProfileVersion provider credentials on deployment    |
| `PACKAGE_NOT_FOUND` tool error            | Unknown npm package name                                                  |
| Trusted mode fails to start               | Trusted bundle not deployed on worker host or integrity mismatch          |
| Evaluation case fails on live LLM package | Use the fixture package for deterministic evaluation                      |

## Security limitations

- MCP tools are read-only; `@osva-ai/connector-npm` restricts outbound HTTPS to `registry.npmjs.org` and `api.npmjs.org`.
- OSVA private-network MCP/REMOTE_HTTP access is off by default; enable only for local development.
- STDIO MCP requires explicit worker opt-in.
- Treat registry metadata and model output as untrusted when rendering reports.

## Limitations

- `@osva-ai/connector-npm@0.1.0` does not ship a Streamable HTTP server; the loopback HTTP bridge is example-local compatibility glue.
- STDIO bootstrap paths resolved on your machine may not match the worker unless you install the connector on the worker or set `OSVA_MCP_CONNECTOR_STDIO_*`.
- Live evaluation against real packages depends on non-deterministic model text; use the fixture package and `evaluation-fixture` run key for platform evaluation.
- `evaluation-fixture` runs intentionally skip artifact persistence so `JSON_EXACT_MATCH` stays stable; use a normal demo run to verify ArtifactStore.
- Registry re-import on repeated bootstrap may create additional tool versions (OSVA registry immutability).
