# Migrating from OSVA examples 1.0.0 to 1.1.x

This guide describes how the **osva-examples** repository splits legacy (**1.0.0**) and **1.1.x** tracks, what changed in published npm packages, and how to adopt Example 19 as the verified external-consumer path.

## Which track should I use?

| Situation                                                                     | Action                                                                                                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production or lab on OSVA OSS **1.0.0**                                       | Stay on Examples **01–18** with npm pins **1.0.0** ([COMPATIBILITY.md](../COMPATIBILITY.md)).                                                                 |
| New project on OSVA **1.1.x**, or npm-only consumption without monorepo links | Start from [Example 19](../examples/19-research-report-agent/README.md) and run [M19.2 installation acceptance](M19_2_EXTERNAL_CONSUMER_ACCEPTANCE.md).       |
| Forking a legacy example for **1.1.x**                                        | Treat it as a **manual migration**: bump pins, align `@osva-examples/utils` / contracts, re-test live against **1.1.x**; do not assume drop-in compatibility. |

Example **19** remains the **M19.2 golden path** for published-package installation and optional live acceptance on platform **1.1.1**.

## npm package versions

| Package                     | Legacy track (01–18) | 1.1.x track (19) |
| --------------------------- | -------------------- | ---------------- |
| `@osva-ai/sdk`              | `1.0.0`              | `1.1.4`          |
| `@osva-ai/contracts`        | `1.0.0`              | `1.1.4`          |
| `@osva-ai/connector-sdk`    | `1.0.0` (where used) | `1.1.4`          |
| `@osva-ai/runtime-protocol` | `1.0.0` (13–14)      | —                |
| `@osva-ai/connector-npm`    | —                    | `0.1.0`          |

All listed versions are published on the public npm registry.

## Platform and authentication

- **Workspace binding** is unchanged in principle: API-key-authenticated creates bind to the workspace of the key principal. Examples still call `/v1/auth/context` for display/diagnostics where needed.
- **OSVA_WORKSPACE_ID** in CLI help remains an operator hint; these examples do not depend on experimental identity/workspace APIs from OSVA main.
- Live Example 19 requires OSVA **1.1.x** services (model gateway, connector registry, artifacts, optional evaluations). Legacy examples are tested against **1.0.0** semantics in CI.

## SDK and API surface changes relevant to examples

### Connector and tool registry (Examples 02, 04–11 vs 19)

| Legacy (SDK 1.0.0)                                                           | 1.1.x (SDK 1.1.4)                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Connector create/discover/import via `OsvaHttpClient` and `/v1/connectors/*` | Example 19 uses `client.connectors.*` and `client.connectors.importMcpTools()` |
| Same REST routes remain available                                            | Prefer typed clients for new code                                              |

When porting a legacy example, you may keep `OsvaHttpClient` (minimal diff) or refactor to typed `client.connectors` as in Example 19.

### Model profiles (Example 12 vs 19)

| Legacy                                                                                   | 1.1.x                                                           |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Example 12 provisions optional demo profiles via `OsvaHttpClient` + `/v1/model-profiles` | Example 19 uses `client.modelProfiles.create` / `createVersion` |
| README documents missing typed client in **1.0.0**                                       | Typed `modelProfiles` resource in **1.1.4**                     |

Set `OSVA_MODEL_PROFILE_VERSION_ID` from the Product Console when you do not want demo provisioning in either track.

### Evaluations and observability (Example 19 only)

- **EvaluationSuite** / evaluation runs are used in Example 19 for deterministic acceptance; not present in Examples 01–18.
- Run observability helpers and manifest features (e.g. **TRUSTED_TYPESCRIPT**) used in Example 19 are **1.1.x**-oriented; legacy examples target REMOTE_HTTP and Workflow V3 patterns from **1.0.0** docs.

### Published npm MCP connector

- **`@osva-ai/connector-npm@0.1.0`** supplies `npm_package_metadata` and `npm_downloads` for STDIO MCP on the worker.
- Streamable HTTP is **not** shipped in that package; Example 19’s `mcp-http.ts` bridge is demo-only for loopback REMOTE_HTTP.

## Worker and networking (unchanged themes)

Private-network and STDIO opt-ins still apply for local MCP/REMOTE_HTTP demos:

```text
OSVA_MCP_CONNECTOR_ALLOW_PRIVATE_NETWORKS=true
OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true
```

STDIO MCP requires worker-side connector installation and documented STDIO allowlists. See Example 19 README for trusted-runtime and Docker worker notes.

## Suggested migration workflow

1. **Confirm platform version** — OSVA deployment **1.1.x** (M19.2 live acceptance uses **1.1.1**).
2. **Clone patterns from Example 19** — `package.json` pins, bootstrap (`src/bootstrap.ts`), model profile helper, connector/npm wiring.
3. **Replace `workspace:*` utils for external repos** — use the M19.2 materializer pattern (vendored `_osva-example-utils`) or copy minimal helpers.
4. **Run hermetic tests** — `pnpm --filter @osva-examples/19-research-report-agent test`.
5. **Prove npm-only install** — `pnpm acceptance:m19-2-install` (no OSVA credentials required).
6. **Optional live proof** — `pnpm acceptance:m19-2-live` with API key, runtime URL, MCP URL or STDIO, model profile.

## What we did not do in this repository

Examples **01–18** were **not** mass-upgraded to **1.1.4** in the monorepo. That avoids regressions for OSVA **1.0.0** users and keeps CI aligned with the legacy matrix. Future upgrades should be example-by-example with live acceptance and updates to [COMPATIBILITY.md](../COMPATIBILITY.md) and `pnpm verify:compatibility`.

## Related documents

- [COMPATIBILITY.md](../COMPATIBILITY.md) — full version matrix and track policy
- [M19_2_EXTERNAL_CONSUMER_ACCEPTANCE.md](M19_2_EXTERNAL_CONSUMER_ACCEPTANCE.md) — installation and live harness for Example 19
- [examples/19-research-report-agent/README.md](../examples/19-research-report-agent/README.md) — environment variables and runtime modes
