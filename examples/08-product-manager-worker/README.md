# 08 Product manager worker

## What this teaches

This example models an employee-like **Product Manager** on OSVA OSS 1.0. It is intentionally different from the growth and research workers: the focus is **mixed qualitative + quantitative product evidence**, **problem discovery**, **evidence-weighted prioritization**, a **deterministic reviewer/critic stage**, and **human approval before publishing a lightweight product brief** — not a one-shot PRD generator.

```text
Collect evidence (4× MCP tools)
  -> Cluster problems
  -> Analyze opportunities
  -> Prioritize
  -> Draft product brief
  -> Review / challenge assumptions
  -> Human approval
  -> Publish product brief (Markdown artifact)
```

Each stage is a separate V3 workflow AGENT node. One REMOTE_HTTP AgentVersion advances a structured JSON envelope through specialist handoffs (evidence collector → analyst → opportunity analyst → PM → reviewer → human lead → report writer).

No paid models or live Productboard/Zendesk/Amplitude credentials are required for the default path.

## Workflow nodes

| Node                    | Role                | Output                                |
| ----------------------- | ------------------- | ------------------------------------- |
| `collect-evidence`      | Evidence collector  | Feedback, tickets, metrics, context   |
| `cluster-problems`      | Product analyst     | Theme clusters with evidence IDs      |
| `analyze-opportunities` | Opportunity analyst | Opportunities with strength/alignment |
| `prioritize`            | Product manager     | Ranked opportunities + rationale      |
| `draft-product-brief`   | Product manager     | Structured brief for top opportunity  |
| `review-brief`          | Product reviewer    | Issues + approval summary             |
| `human-approval`        | Human product lead  | Approve/reject publication            |
| `publish-product-brief` | Report writer       | Markdown artifact                     |

## Prerequisites

- Node.js 24+ and pnpm 12.4.1
- OSVA OSS 1.0.0 web, worker, workflow orchestrator, artifact storage
- API key with connector/tool, agent, workflow, approval, and artifact permissions
- Worker reachability to `OSVA_PRODUCT_MCP_CONNECTOR_URL` and `OSVA_PRODUCT_RUNTIME_URL`

Local development typically requires `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true` for loopback MCP/runtime URLs.

## Configure

Export values from `.env.example`. Required:

- `OSVA_BASE_URL`
- `OSVA_API_KEY`
- `OSVA_PRODUCT_MCP_CONNECTOR_URL`
- `OSVA_PRODUCT_RUNTIME_URL`

Optional input:

- `OSVA_PRODUCT_ID` (default `flowtask-pro`)
- `OSVA_PRODUCT_OBJECTIVE` (default activation-focused objective)
- `OSVA_PRODUCT_CONTEXT`

Interactive approval is default; use `OSVA_AUTO_APPROVE=true` only for scripted demos.

## Build and run

```bash
pnpm install
pnpm --filter @osva-examples/08-product-manager-worker build
pnpm example:08
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
  "opportunityCount": 5,
  "reviewIssueCount": 1,
  "childRuns": [
    {
      "node": "collect-evidence",
      "runId": "<child run id>",
      "steps": [{ "kind": "TOOL", "bindingName": "product_feedback_tool", "status": "SUCCEEDED" }]
    }
  ]
}
```

## Fixture evidence

The default product **`flowtask-pro`** includes:

- Repeated onboarding confusion in feedback and support tickets
- Quantitative onboarding step drop-off (invite-team completion below 60%)
- Noisy but **strategically low-alignment** dark mode requests
- Conflicting pricing/enterprise cues vs SMB activation objective

Clustering is **transparent keyword/category rules**, not ML. Prioritization combines evidence strength, business alignment, and reach — mention volume alone does not win (dark mode stays below onboarding).

## MCP connector (`product_data`)

| Tool                    | Stand-in for       |
| ----------------------- | ------------------ |
| `get_customer_feedback` | Productboard/CRM   |
| `get_support_tickets`   | Zendesk/Intercom   |
| `get_product_metrics`   | Amplitude/Mixpanel |
| `get_product_context`   | Strategy docs/Jira |

## Reviewer role

The `review-brief` stage runs deterministic checks for weak evidence, vague metrics, scope risk, solution bias, and business conflicts. Issues appear in the final artifact under **Reviewer Concerns**; they are not silently removed.

## Approval and artifact

OSVA 1.0 approvals support **approve/reject only**. After approval, the runtime publishes a Markdown product brief (lightweight PRD scope — not a full engineering spec).

## Observability

- **`collect-evidence`** — four `TOOL` steps (feedback, tickets, metrics, context)
- **Analysis/draft/review nodes** — deterministic AGENT executions
- **`human-approval`** — workflow pause
- **`publish-product-brief`** — artifact creation in output

## Limitations

- Synthetic fixtures only; no real customer data
- Deterministic clustering and prioritization — not semantic search or LLM synthesis
- Brief content is templated from the top prioritized opportunity
- Cannot edit brief fields inside the approval node on OSVA 1.0

## Future integrations

Productboard, Jira/Linear, Zendesk/Intercom, Mixpanel/Amplitude, GA4, CRM, warehouse metrics, Figma, GitHub, Slack, and optional model-backed qualitative synthesis — with deterministic guardrails retained for metrics and prioritization.

## Offline verification

```bash
pnpm --filter @osva-examples/08-product-manager-worker test
pnpm --filter @osva-examples/08-product-manager-worker typecheck
pnpm --filter @osva-examples/08-product-manager-worker build
```
