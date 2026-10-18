# 09 Founder's office worker

## What this teaches

This example models an employee-like **Founder's Office / Chief of Staff** associate on OSVA OSS 1.0. It synthesizes KPIs, projects, sales, customer, and operational inputs into **prioritized attention items**, **recommended actions**, and an **executive operating brief** — not a generic LLM summary.

```text
Collect company signals (5× MCP tools)
  -> Normalize signals
  -> Detect risks & opportunities
  -> Prioritize attention
  -> Prepare recommended actions
  -> Human approval
  -> Write executive brief (Markdown artifact)
```

Each stage is a separate V3 workflow AGENT node. One REMOTE_HTTP AgentVersion advances a structured JSON envelope. The collector invokes five fixture-backed MCP tools so observability shows multiple `TOOL` steps.

No Slack, Notion, CRM, finance systems, paid models, or live web access are required for the default path.

## Employee role and workflow nodes

| Node                         | Role                    | Output                                 |
| ---------------------------- | ----------------------- | -------------------------------------- |
| `collect-company-signals`    | Ops data collector      | KPIs, projects, sales, customer, ops   |
| `normalize-signals`          | Chief of Staff analyst  | Common signal records with evidence    |
| `detect-risks-opportunities` | Executive analyst       | Risks, opportunities, decisions        |
| `prioritize-attention`       | Founder prioritization  | Ranked attention items + rationale     |
| `prepare-actions`            | CoS action planner      | Recommended actions (no external exec) |
| `human-approval`             | Founder / exec operator | Approve/reject brief publication       |
| `write-executive-brief`      | Brief writer            | Markdown executive brief artifact      |

## Prerequisites

- Node.js 24+ and pnpm 12.4.1
- OSVA OSS 1.0.0 web, worker, workflow orchestrator, artifact storage
- API key with connector/tool, agent, workflow, approval, and artifact permissions
- Worker reachability to `OSVA_FOUNDERS_MCP_CONNECTOR_URL` and `OSVA_FOUNDERS_RUNTIME_URL`

Local development typically requires `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true` for loopback MCP/runtime URLs.

## Configure

Export values from `.env.example`. Required:

- `OSVA_BASE_URL`
- `OSVA_API_KEY`
- `OSVA_FOUNDERS_MCP_CONNECTOR_URL`
- `OSVA_FOUNDERS_RUNTIME_URL`

Optional input:

- `OSVA_FOUNDERS_COMPANY_ID` (default `atlas-runtime`)
- `OSVA_FOUNDERS_OBJECTIVE`
- `OSVA_FOUNDERS_CONTEXT`

Interactive approval is default; use `OSVA_AUTO_APPROVE=true` only for scripted demos.

## Build and run

```bash
pnpm install
pnpm --filter @osva-examples/09-founders-office-worker build
pnpm example:09
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
  "attentionItemCount": 8,
  "actionCount": 6,
  "childRuns": [
    {
      "node": "collect-company-signals",
      "runId": "<child run id>",
      "steps": [{ "kind": "TOOL", "bindingName": "company_kpis_tool", "status": "SUCCEEDED" }]
    }
  ]
}
```

## Fixture company (`atlas-runtime`)

Synthetic Series A B2B SaaS snapshot with:

- **Serious risk:** worsening logo churn, overdue enterprise launch, stalled Acme deal, rising burn with slowing growth
- **Opportunity:** strong paid ROAS under spend cap, enterprise pipeline momentum, mobile project ahead
- **Ambiguous signal:** MRR growth deceleration (watchlist, not a standalone priority)
- **Non-urgent noise:** snack preference survey mentions (low urgency/impact)

All metrics and claims are derived from fixture fields — nothing is invented outside the dataset.

## MCP connector (`company_ops`)

| Tool                     | Stand-in for             |
| ------------------------ | ------------------------ |
| `get_kpis`               | Warehouse / finance      |
| `get_projects`           | Jira / Linear / Notion   |
| `get_sales_pipeline`     | Salesforce / HubSpot     |
| `get_customer_signals`   | Zendesk / Intercom / NPS |
| `get_operational_issues` | Internal ops ticketing   |

## Prioritization

Transparent founder-attention scoring from linked signal urgency/impact, item type boosts, objective alignment, and penalties for low-impact noise. Mention volume alone does not override strategic risks.

## Approval and actions

OSVA 1.0 approvals support **approve/reject only**. Recommended actions are included in the brief and approval summary for human follow-up — **V1 does not execute** Slack messages, CRM updates, or budget changes.

Rejected approval stops publication of the Markdown artifact (same convention as Examples 04–08).

## Observability

- **`collect-company-signals`** — five `TOOL` invocations
- **Normalize / detect / prioritize / prepare** — deterministic AGENT stages
- **`human-approval`** — workflow pause
- **`write-executive-brief`** — artifact creation metadata in output

## Limitations

- Deterministic rules — not a substitute for executive judgment
- Synthetic fixtures only
- Actions are proposals, not automated side effects
- Cannot edit brief contents inside the approval node on OSVA 1.0

## Future integrations

Slack, Notion, Jira/Linear, Salesforce/HubSpot, ERP/finance, support platforms, analytics warehouse, calendar/email digests, and scheduled weekly brief workflows — with deterministic guardrails retained for KPI thresholds and prioritization.

## Offline verification

```bash
pnpm --filter @osva-examples/09-founders-office-worker test
pnpm --filter @osva-examples/09-founders-office-worker typecheck
pnpm --filter @osva-examples/09-founders-office-worker build
```
