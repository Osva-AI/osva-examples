# 07 Growth analyst worker

## What this teaches

This example models an employee-like **Growth Analyst** on OSVA OSS 1.0. It is intentionally different from the SEO and research workers: the focus is **multi-source quantitative metrics**, **funnel diagnosis**, **experiment ideation**, **transparent prioritization**, and **human approval before publishing a growth brief** — not page SEO or qualitative research synthesis.

```text
Collect metrics (5× MCP tools)
  -> Analyze funnel
  -> Detect opportunities
  -> Generate experiments
  -> Prioritize experiments
  -> Human approval
  -> Write growth experiment brief (Markdown artifact)
```

Each stage is a separate V3 workflow AGENT node. One REMOTE_HTTP AgentVersion advances a structured JSON envelope. The collector invokes five fixture-backed MCP tools (`get_traffic_metrics`, `get_funnel_metrics`, `get_revenue_metrics`, `get_retention_metrics`, `get_campaign_metrics`) so observability shows multiple `TOOL` steps on the first node.

No paid models, GA4, Shopify, Stripe, or ad-platform credentials are required for the default path.

## Employee role and workflow nodes

| Workflow node            | Role                 | Output                                      |
| ------------------------ | -------------------- | ------------------------------------------- |
| `collect-metrics`        | Metrics collector    | Traffic, funnel, revenue, retention, ads    |
| `analyze-funnel`         | Funnel analyst       | Computed rates and narrative summary        |
| `detect-opportunities`   | Growth diagnostician | Rule-based findings and opportunities       |
| `generate-experiments`   | Experiment designer  | Hypothesis-backed experiment cards          |
| `prioritize-experiments` | Growth lead          | ICE-style ranking + approval summary        |
| `human-approval`         | Human operator       | Approve/reject brief publication            |
| `write-growth-brief`     | Report writer        | Markdown growth analysis & experiment brief |

## Prerequisites

- Node.js 24+ and pnpm 12.4.1
- OSVA OSS 1.0.0 web, worker, workflow orchestrator, artifact storage
- API key with connector/tool, agent, workflow, approval, and artifact permissions
- Worker reachability to `OSVA_GROWTH_MCP_CONNECTOR_URL` and `OSVA_GROWTH_RUNTIME_URL`

Local development typically requires `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true` when the worker calls loopback MCP/runtime URLs.

## Configure

Export values from `.env.example`. Required:

- `OSVA_BASE_URL`
- `OSVA_API_KEY`
- `OSVA_GROWTH_MCP_CONNECTOR_URL`
- `OSVA_GROWTH_RUNTIME_URL`

Optional input:

- `OSVA_GROWTH_BUSINESS_ID` (default `northpeak-outdoors`)
- `OSVA_GROWTH_OBJECTIVE` (`conversion`, `retention`, `revenue`, `activation`, `overall-growth`)
- `OSVA_GROWTH_CONTEXT`

Interactive approval is default; use `OSVA_AUTO_APPROVE=true` only for scripted demos.

## Build and run

```bash
pnpm install
pnpm --filter @osva-examples/07-growth-analyst-worker build
pnpm example:07
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
  "experimentCount": 4,
  "findingCount": 6,
  "childRuns": [
    {
      "node": "collect-metrics",
      "runId": "<child run id>",
      "steps": [{ "kind": "TOOL", "bindingName": "growth_traffic_tool", "status": "SUCCEEDED" }]
    }
  ]
}
```

## Fixture datasets

The default business **`northpeak-outdoors`** is a synthetic D2C outdoor brand with coherent traffic, ecommerce funnel, revenue, retention, and paid-media fixtures. The demo intentionally includes a **weak product-view → add-to-cart step** so prioritization surfaces PDP/checkout experiments.

A secondary fixture `northpeak-zero-views` exists for tests that exercise divide-by-zero guards (rates return `null`, not NaN).

Metrics are **deterministic** — every rate is calculated from fixture counts (CAC from spend/conversions, ROAS from paid revenue/spend, refund rate from refunds/revenue, funnel step rates from stage counts).

## Deterministic analysis vs model strategy

V1 analysis is **rule-based**:

- Transparent thresholds (for example add-to-cart below 20%, repeat purchase below 15%, ROAS below 3.0)
- Opportunities and experiments are templated from finding IDs
- Prioritization uses documented ICE-style weights plus a small objective boost

This demonstrates orchestration and growth ops structure — not ML forecasting or automated lift estimates.

## MCP connector (`growth_data`)

| Tool                    | Stand-in for                     |
| ----------------------- | -------------------------------- |
| `get_traffic_metrics`   | GA4 / analytics                  |
| `get_funnel_metrics`    | Product analytics / funnel tools |
| `get_revenue_metrics`   | Shopify / WooCommerce / Stripe   |
| `get_retention_metrics` | CRM / CDP cohort summaries       |
| `get_campaign_metrics`  | Meta Ads / Google Ads exports    |

## Approval and artifact

OSVA 1.0 approvals support **approve/reject only**. The approval node description summarizes findings, top opportunity, prioritized experiments, and key metrics computed in the `prioritize-experiments` stage.

After approval, the runtime renders Markdown (`# Growth Analysis & Experiment Brief`) and creates it through the public artifact API.

## Observability

Inspect child run steps on:

- **`collect-metrics`** — five `TOOL` invocations (traffic, funnel, revenue, retention, campaign bindings)
- **Analysis nodes** — deterministic AGENT executions without models
- **`human-approval`** — workflow pause until a decision
- **`write-growth-brief`** — artifact creation metadata in workflow output

## Limitations

- Synthetic data only; thresholds are demo rules, not industry benchmarks
- No causal inference, incrementality, or multi-touch attribution
- Experiments are brief-level proposals, not wired to an A/B platform
- Cannot edit experiment fields inside the approval node on OSVA 1.0

## Future integrations

Replace MCP handlers with connectors for GA4, Shopify/WooCommerce, Stripe, CRM/CDP, Meta/Google Ads, Mixpanel/Amplitude, and an experimentation platform. Schedule recurring workflow runs for weekly growth reviews. Optional model-backed narrative could augment — but should not replace — deterministic metric guardrails.

## Offline verification

```bash
pnpm --filter @osva-examples/07-growth-analyst-worker test
pnpm --filter @osva-examples/07-growth-analyst-worker typecheck
pnpm --filter @osva-examples/07-growth-analyst-worker build
```
