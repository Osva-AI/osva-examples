# M19.2 — Example 19 external-consumer acceptance

Reproducible harness proving an external developer can install published OSVA npm packages, materialize Example 19 without monorepo `workspace:` dependencies, build, run deterministic tests, and (optionally) execute a live research run against OSVA **1.1.1**.

## Modes

| Mode             | Command                         | Requires live OSVA |
| ---------------- | ------------------------------- | ------------------ |
| **Installation** | `pnpm acceptance:m19-2-install` | No                 |
| **Live**         | `pnpm acceptance:m19-2-live`    | Yes                |

Installation mode **never** reports a successful live agent execution: `live_agent_execution` is **`NOT_RUN`** with an installation-only detail, and granular live gates are **`NOT_RUN`** with `Run with --mode live`.

In **live** mode, granular checks run first; `live_agent_execution` is recorded last as a rollup (**`PASS`** only when every granular live execution check passed). Live mode cannot report overall **`PASS`** while any mandatory live check (including the rollup) is still **`NOT_RUN`** or **`FAIL`**.

## Clean installation (PowerShell)

```powershell
cd C:\path\to\osva-examples
corepack enable
corepack prepare pnpm@12.4.1 --activate
pnpm acceptance:m19-2-install
```

Evidence is written under `artifacts/acceptance/m19-2/` (gitignored).

## Live acceptance

Configure worker-reachable URLs for Docker-based local development (see Example 19 README). Do **not** commit credentials.

```powershell
$env:OSVA_BASE_URL = "http://127.0.0.1:8080"
$env:OSVA_API_KEY = "osva_ak_..."   # from your deployment only; never commit
$env:OSVA_AGENT_RUNTIME_URL = "http://host.docker.internal:8799/execute"
$env:OSVA_MCP_CONNECTOR_URL = "http://host.docker.internal:8798/mcp"
$env:OSVA_MODEL_PROFILE_VERSION_ID = "<uuid>"
pnpm acceptance:m19-2-live
```

If prerequisites are missing, the report status is **`PENDING`** with honest `NOT_RUN` live checks.

## Published package pins

| Package                  | Version |
| ------------------------ | ------- |
| `@osva-ai/sdk`           | `1.1.4` |
| `@osva-ai/contracts`     | `1.1.4` |
| `@osva-ai/connector-sdk` | `1.1.4` |
| `@osva-ai/connector-npm` | `0.1.1` |

Platform target for live mode: **OSVA 1.1.1**.

## JSON report schema

Reports include:

- `schemaVersion`, `milestone`, `mode`, `status`, `timestamp`, `durationMs`
- `platformVersion`, `packageVersions`, `checks[]` (`PASS` \| `FAIL` \| `NOT_RUN`)
- `runId`, `agentVersionId`, `artifact` (live mode, when available)
- `errors`, `deferredChecks`

Secrets and authorization headers are redacted.

## Cleanup

Temporary consumer directories are removed automatically unless `--keep-temp` is passed. Delete `artifacts/acceptance/m19-2/*.json` locally when no longer needed.

## Maintainer tests

```bash
node --test scripts/acceptance/m19-2-external-consumer/test/*.test.mjs
```

See [docs/M19_2_EXTERNAL_CONSUMER_ACCEPTANCE.md](../../../docs/M19_2_EXTERNAL_CONSUMER_ACCEPTANCE.md) for the full milestone summary.
