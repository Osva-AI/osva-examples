# 11 Growth operations worker (flagship)

## Why this is the flagship example

Examples **01–09** each teach one primary pattern (minimal run, MCP tools, durable workflow, SEO, research, support routing, growth analysis, product management, founder’s office). Example **10** adds operational safety (approval, simulated remediation, recovery verification, BRANCH).

**Example 11 combines them** into a single cross-functional “growth operations employee”:

- Multi-source MCP data (commerce, funnel, campaigns, customer, content, product)
- Explicit specialist-style workflow stages (collect → diagnose → customer → research → opportunities → critic → select → **BRANCH** → prepare → **APPROVAL** → execute → verify → brief)
- Deterministic diagnosis and critic guardrails (not model discretion)
- Intervention routing by type
- Human approval before `execute_demo_action`
- Idempotent simulated actions and honest execution verification (no fabricated uplift)
- Markdown artifact and stderr observability

All data and actions are **synthetic fixtures**. No ad spend, publishing, email, or commerce systems are contacted.

## Architecture

```text
Business objective
      ↓
collect-signals (6× MCP read tools)
      ↓
diagnose-growth
      ↓
analyze-customer-signals
      ↓
research-context
      ↓
generate-opportunities
      ↓
critic-review
      ↓
select-intervention  →  sets /interventionRoute
      ↓
intervention-branch (BRANCH)
      ↓
prepare-action
      ↓
human-approval
      ↓
execute-action (execute_demo_action MCP)
      ↓
verify-execution
      ↓
write-growth-operations-brief (artifact)
```

One REMOTE_HTTP AgentVersion advances a structured JSON envelope across AGENT nodes. Workflow structure remains inspectable in the OSVA UI.

## Default fixture narrative (D2C)

Business: **`northpeak-outdoors`** (outdoor D2C, shared concept with example 07).

Signals include healthy traffic, a **cart→checkout drop** (shipping sticker shock in customer verbatims), paid CPA pressure, and underperforming PDP organic CTR. The critic **downgrades** a flashy 20%-off paid campaign when the objective is **improve-conversion**, favoring a checkout shipping-threshold experiment instead.

## MCP connector (`growth_ops`)

| Tool                               | Purpose                            |
| ---------------------------------- | ---------------------------------- |
| `get_commerce_metrics`             | Orders, revenue, AOV, refunds      |
| `get_funnel_metrics`               | Session → purchase funnel          |
| `get_campaign_metrics`             | Paid spend and conversions         |
| `get_customer_signals`             | Themed feedback snippets           |
| `get_content_signals`              | SEO/content CTR and rank           |
| `get_inventory_or_product_context` | SKU inventory and margin           |
| `execute_demo_action`              | Idempotent in-memory action record |

## Guardrails

- **Diagnosis** uses rule-based funnel and objective mapping.
- **Opportunities** must cite evidence IDs present in the envelope.
- **Critic** flags metric mismatch, margin risk, weak evidence, and contradictory campaign-vs-conversion stories.
- **Approval** is required before `execute_demo_action`.
- **Verification** checks the demo action store only — it does not claim experiment results.

## Prerequisites

- Node.js 24+ and pnpm 12.4.1
- OSVA OSS 1.0.0 (web, worker, workflow orchestrator, artifacts)
- API key with connector, tool, agent, workflow, approval, and artifact permissions
- Worker reachability to `OSVA_GROWTH_OPS_MCP_CONNECTOR_URL` and `OSVA_GROWTH_OPS_RUNTIME_URL`

Local loopback URLs typically need `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true` on the OSVA deployment. Default ports: **8805** (MCP), **8806** (runtime).

## Configure and run

```bash
pnpm install
pnpm --filter @osva-examples/11-growth-operations-worker build
pnpm example:11
```

Required env (see `.env.example`): `OSVA_BASE_URL`, `OSVA_API_KEY`, `OSVA_GROWTH_OPS_MCP_CONNECTOR_URL`, `OSVA_GROWTH_OPS_RUNTIME_URL`.

Optional: `OSVA_GROWTH_OPS_BUSINESS_ID`, `OSVA_GROWTH_OPS_OBJECTIVE`, `OSVA_GROWTH_OPS_CONTEXT`, `OSVA_AUTO_APPROVE` (scripted demos only).

## Tests

```bash
pnpm --filter @osva-examples/11-growth-operations-worker test
```

## Production extensions

Replace MCP handlers with real systems when you are ready:

- Commerce: Shopify, WooCommerce, warehouse
- Analytics: GA4, Mixpanel, Amplitude
- Ads: Meta Ads, Google Ads
- SEO: Search Console
- CDP/CRM, email/WhatsApp, experimentation platforms
- Slack/Jira/Linear for human coordination
- Model-backed specialist nodes (this example uses deterministic policy code for teaching clarity)
