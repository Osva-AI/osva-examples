# 21 Commerce & Growth Analyst

## What this demonstrates

**OSVA 1.1.x** multi-connector agent combining **Shopify** commerce data with **GA4** acquisition and ecommerce reporting:

1. Accepts bounded date windows, GA4 property id, and pagination limits.
2. Registers **two independent STDIO MCP connectors** (`@osva-ai/connector-shopify@0.1.1`, `@osva-ai/connector-ga4@0.1.1`).
3. Imports **six read-only tools** on one `AgentVersion`.
4. Executes via **REMOTE_HTTP** or **TRUSTED_TYPESCRIPT**.
5. Normalizes provider output and produces a deterministic structured brief (no model binding).
6. Polls the run and returns **TOOL** run-step observability.

```text
startDate/endDate + ga4PropertyId
        |
        v
Bootstrap: Shopify ConnectorVersion (STDIO) + GA4 ConnectorVersion (STDIO)
        |
        v
Discover/import read-only tools -> bind six ToolVersions
        |
        v
Agent run -> shopify.shop.get + product.list + order.list
          + ga4.property.get + report.acquisition + report.ecommerce
        |
        v
Deterministic brief: period, commerce, acquisition, ecommerce, evidence, limitations
```

## Compatibility (this example only)

| Component                    | Version |
| ---------------------------- | ------- |
| OSVA OSS                     | `1.1.x` |
| `@osva-ai/sdk`               | `1.1.4` |
| `@osva-ai/contracts`         | `1.1.4` |
| `@osva-ai/connector-sdk`     | `1.1.4` |
| `@osva-ai/connector-shopify` | `0.1.1` |
| `@osva-ai/connector-ga4`     | `0.1.1` |

## Imported MCP tools (read-only)

| Connector | Tool                     | Purpose                                             |
| --------- | ------------------------ | --------------------------------------------------- |
| Shopify   | `shopify.shop.get`       | Shop metadata (currency, timezone)                  |
| Shopify   | `shopify.product.list`   | Bounded product catalog sample                      |
| Shopify   | `shopify.order.list`     | Bounded order sample (optional `query` date filter) |
| GA4       | `ga4.property.get`       | Property timezone and currency                      |
| GA4       | `ga4.report.acquisition` | Channel session metrics                             |
| GA4       | `ga4.report.ecommerce`   | Property-level ecommerce overview                   |

Not imported: `shopify.order.get`, `shopify.product.get`, `ga4.report.run`, `ga4.report.realtime`, inventory/location tools, and all mutation-shaped APIs.

## Worker secrets (never in transportConfig or run input)

| Variable                                | Connector                                                          |
| --------------------------------------- | ------------------------------------------------------------------ |
| `OSVA_CONNECTOR_SHOPIFY_SHOP`           | Shopify shop host (`*.myshopify.com`)                              |
| `OSVA_CONNECTOR_SHOPIFY_ACCESS_TOKEN`   | Read-only Admin API token (worker env / secret reference)          |
| `OSVA_CONNECTOR_GA4_PROPERTY_ID`        | Default GA4 property (optional if run input supplies `propertyId`) |
| `GOOGLE_APPLICATION_CREDENTIALS` or ADC | GA4 readonly (`analytics.readonly`)                                |

Install both connector packages on the **worker host** or override per-connector STDIO commands (`OSVA_SHOPIFY_MCP_STDIO_*`, `OSVA_GA4_MCP_STDIO_*`).

## Deterministic offline run

Hermetic vitest exercises fixtures — no live Shopify, GA4, or OSVA calls:

```powershell
pnpm --filter @osva-examples/21-commerce-growth-analyst test
```

Fixture run input uses `runKey=evaluation-fixture` and `ga4PropertyId=fixture-property-424242`.

## Optional live run

Copy `.env.example`, set OSVA + worker connector env, export variables, then:

```powershell
pnpm example:21
```

Requires `OSVA_MCP_CONNECTOR_STDIO=true`, worker-spawned connectors, and loopback `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS` for local dev.

## Data reconciliation limitations

- Shopify sampled order revenue is **not** store-wide totals when pagination applies.
- GA4 purchase metrics are **not** reconciled to Shopify revenue (currency, tax, refunds, attribution, timezone).
- The brief surfaces limitations explicitly instead of inferring ROAS or cross-provider conversion rates.

## External consumer acceptance

From repo root:

```powershell
pnpm acceptance:b6-2-pins
pnpm acceptance:b6-2-install
```

Installation acceptance materializes Examples **20–21** outside the monorepo, runs `npm install`, typecheck, test, and build. This proves **npm consumer** compatibility — not live OSVA execution.

## Security restrictions

- Read-only Shopify token scopes; Analytics readonly for GA4.
- No secrets in JSON input, manifests, artifacts, or logs.
- Provider strings are untrusted display data only.
