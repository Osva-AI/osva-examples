# M19.2 external-consumer acceptance (Example 19)

## Objective

Prove that an external developer can consume Example 19 using **only published npm packages**, without OSVA core source or monorepo `workspace:*` links, and optionally complete a live research run on OSVA **1.1.1**.

This complements platform-level M17.8/M17.9 evidence; it does not replace operator workflow proof in the OSVA repository.

## Dependency audit (Example 19)

| Runtime import                                                                           | Monorepo source                          | Standalone consumer resolution                                                        |
| ---------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `@osva-ai/sdk`, `@osva-ai/contracts`, `@osva-ai/connector-sdk`, `@osva-ai/connector-npm` | npm (pinned in example `package.json`)   | Same pins at **1.1.4** / **0.1.0** via generated `package.json`                       |
| `@osva-examples/utils`                                                                   | `packages/example-utils` (`workspace:*`) | Vendored copy under `src/_osva-example-utils/` at materialize time; imports rewritten |

Examples **01–18** remain on the repository **1.0.0** baseline in [COMPATIBILITY.md](../COMPATIBILITY.md). Only Example 19 targets OSVA **1.1.x** packages.

## Harness location

`scripts/acceptance/m19-2-external-consumer/run.mjs`

### Installation mode

1. Isolated temp directory (or `OSVA_M19_CONSUMER_DIR`)
2. Materialize consumer (Example 19 `src`/`test` + vendored utils)
3. `npm install` from the public registry
4. Scan for forbidden workspace/monorepo imports
5. `npm run build`
6. Verify `dist/main.js`, `dist/app.js`, connector package
7. `npm test` (deterministic vitest fixtures)
8. JSON evidence with live checks **`NOT_RUN`**

### Live mode

Runs installation steps first, then (when env is configured):

1. Auth context / deployment reachability
2. `runResearchReportExample` from built consumer
3. Terminal **`SUCCEEDED`**
4. **MODEL** and **TOOL** run-step activity
5. Download Markdown artifact (demo run, not evaluation-only fixture)
6. Validate report sections (`# npm research report`, `## Key findings`, `## Overall assessment`)

## Commands

```bash
pnpm acceptance:m19-2-install
pnpm acceptance:m19-2-live   # requires OSVA_BASE_URL, OSVA_API_KEY, runtime/MCP URLs, model profile
node --test scripts/acceptance/m19-2-external-consumer/test/*.test.mjs
```

## Evidence output

`artifacts/acceptance/m19-2/m19-2-<mode>-<timestamp>.json` (gitignored).

Example shape:

```json
{
  "schemaVersion": "1",
  "milestone": "M19.2",
  "mode": "installation",
  "status": "PASS",
  "platformVersion": "1.1.1",
  "packageVersions": {
    "@osva-ai/sdk": "1.1.4"
  },
  "checks": [{ "id": "npm_install", "title": "Install consumer dependencies from npm registry", "status": "PASS" }],
  "deferredChecks": ["live_agent_execution"]
}
```

## Environment variables (live)

| Variable                        | Required                                   |
| ------------------------------- | ------------------------------------------ |
| `OSVA_BASE_URL`                 | Yes                                        |
| `OSVA_API_KEY`                  | Yes                                        |
| `OSVA_AGENT_RUNTIME_URL`        | Yes (REMOTE_HTTP)                          |
| `OSVA_MCP_CONNECTOR_URL`        | Yes unless `OSVA_MCP_CONNECTOR_STDIO=true` |
| `OSVA_MODEL_PROFILE_VERSION_ID` | Recommended                                |
| `OSVA_TRUSTED_RUNTIME_ROOT`     | Alternative to REMOTE_HTTP                 |

See [examples/19-research-report-agent/README.md](../examples/19-research-report-agent/README.md) for Docker worker networking and private-network opt-ins.

## Live reporting semantics

| Check                                                             | Installation mode                                                     | Live mode                                                                                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Granular live gates (`live_prerequisites` … `artifact_structure`) | `NOT_RUN` with detail `Run with --mode live`                          | Executed; each is mandatory for overall status                                                                                                                               |
| `live_agent_execution` (rollup)                                   | `NOT_RUN` with detail `Installation mode does not execute live runs.` | **`PASS`** when all granular live execution checks pass; **`FAIL`** if any granular check failed; **`NOT_RUN`** when prerequisites were missing or the harness stopped early |

Overall status rules:

- **Installation:** mandatory set is installation-only; live gates and `live_agent_execution` may remain `NOT_RUN` while status is **`PASS`** (exit code `0`).
- **Live:** mandatory set includes every installation check, all granular live execution checks, and **`live_agent_execution`**. Any mandatory check that is not **`PASS`** prevents **`PASS`** overall (`FAIL` if any check failed; **`PENDING`** if any mandatory check is still `NOT_RUN`).

The harness records `live_agent_execution` **after** live gates run so live-mode JSON never carries the installation-only explanation when a live run succeeded.

## Known limitations

- Materialization copies TypeScript sources from the monorepo; it does not publish Example 19 as its own npm package.
- Live acceptance requires operator credentials and a compatible deployment; CI may record **`PENDING`** when live env is absent.
- Installation mode uses `npm install` (not pnpm) to mirror a typical external consumer workflow.
- Examples **01–18** are **not** claimed compatible with OSVA **1.1.4** without separate verification.
- Windows npm spawning uses `node` + `npm-cli.js` with `shell: false` (Node.js 24 **DEP0190** safe).

## M19.2 closeout (verified evidence)

Evidence files live under `artifacts/acceptance/m19-2/` (gitignored). Do not commit JSON from local runs.

| Run                            | Artifact (local)                        | Status   | Exit | Notes                                                                                                                                                                                                                                                                         |
| ------------------------------ | --------------------------------------- | -------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installation (post–rollup fix) | `m19-2-installation-1793853521915.json` | **PASS** | `0`  | All installation mandatory checks **PASS**; `live_agent_execution` **NOT_RUN** with installation detail; duration ~44s                                                                                                                                                        |
| Installation (DEP0190 fix)     | `m19-2-installation-1793851972021.json` | **PASS** | `0`  | Same installation semantics                                                                                                                                                                                                                                                   |
| Live agent execution           | `m19-2-live-1793853198478.json`         | **PASS** | `0`  | All granular live checks **PASS**; runId `044f7386-027c-43d0-924b-dbda59f2181c`; duration ~38s. **Pre-rollup-fix:** `live_agent_execution` incorrectly showed installation-mode `NOT_RUN` — re-run `pnpm acceptance:m19-2-live` after merge to refresh rollup row to **PASS** |

Focused verification (this closeout pass):

```text
pnpm test:acceptance:m19-2          → 17/17 pass
pnpm format:check                   → pass
pnpm verify:whitespace              → pass
pnpm verify:secrets                 → pass
pnpm --filter @osva-examples/19-research-report-agent test → 22/22 pass
pnpm acceptance:m19-2-install       → PASS (exit 0)
```

Node.js 24: no **DEP0190** when running m19-2 acceptance tests (Windows `npm` via `npm-cli.js`, `shell: false`).

## Security

- Reports redact API keys and bearer tokens.
- The harness does not enable private-network or STDIO MCP operator flags automatically.
- Never commit `.env` files or acceptance JSON containing secrets.
