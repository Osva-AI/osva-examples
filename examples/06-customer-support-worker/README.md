# 06 Customer support worker

## What this teaches

This example models an employee-like **customer support worker** on OSVA OSS 1.0. It is intentionally different from the SEO and research examples: the focus is **operational decision-making**, **conditional routing**, **policy enforcement**, **MCP tools with side effects**, **human escalation/approval**, and **controlled actions** — not analysis artifacts or research synthesis.

```text
Classify intent
  -> Lookup customer/order/shipment (MCP data tools)
  -> Evaluate demo policy (deterministic code)
  -> Plan route
  -> BRANCH
        | reply-only  -> write response
        | auto-action -> execute refund/cancel tool -> write response
        | needs-approval -> human approval -> execute tool -> write response
        | escalate    -> create escalation -> write response
```

Each stage before the branch is a separate V3 **AGENT** node. One REMOTE_HTTP AgentVersion implements role-specific behavior by advancing a structured JSON envelope. OSVA **V3 BRANCH** routing uses `/route` on the envelope so observability shows explicit operational paths.

**No real refunds, cancellations, or payments occur.** All customer, order, shipment, and policy data is synthetic fixture data.

## Architecture

| Workflow node       | Role             | Notes                                             |
| ------------------- | ---------------- | ------------------------------------------------- |
| `classify-intent`   | Classifier       | Deterministic keyword intent mapping              |
| `lookup-context`    | Context agent    | MCP `get_customer`, `get_order`, `get_shipment`   |
| `evaluate-policy`   | Policy agent     | Calls deterministic demo policy engine            |
| `plan-resolution`   | Resolution agent | Sets `route` for BRANCH (`reply-only`, etc.)      |
| `route-decision`    | BRANCH           | JSON Pointer selector `/route`                    |
| `human-approval`    | Human operator   | Sensitive refunds/cancellations (approve/reject)  |
| `execute-action`    | Action agent     | MCP `issue_refund` / `cancel_order` (demo ledger) |
| `create-escalation` | Escalation agent | Local escalation record for unsupported cases     |
| `write-response`    | Response agent   | Customer-facing outcome text                      |

The **policy engine is code**, not model discretion. Agents cannot override `policyDecision`.

## Supported demo intents

| Intent           | Example message                      | Typical route                          |
| ---------------- | ------------------------------------ | -------------------------------------- |
| `refund-request` | "My order is late. I want a refund." | Auto refund ($40) or approval ($900)   |
| `cancel-order`   | "Please cancel my order"             | Auto cancel when undelivered + delayed |
| `order-status`   | "Where is my shipment?"              | Reply-only status                      |
| `shipment-delay` | "It is delayed again"                | Reply-only status                      |
| `unknown`        | Unrecognized text                    | Escalation                             |

## Fixture customers (synthetic)

| Customer ID           | Primary order           | Scenario                          |
| --------------------- | ----------------------- | --------------------------------- |
| `cust-demo-001`       | `ord-delay-40`          | Delayed shipment, **$40** refund  |
| `cust-enterprise-001` | `ord-delay-900`         | Delayed shipment, **$900** refund |
| `cust-archive-001`    | `ord-delivered-old`     | Delivered **90+ days** ago        |
| `cust-cancelled-001`  | `ord-already-cancelled` | Already cancelled                 |
| `cust-status-001`     | `ord-in-transit-ok`     | In-transit status reply           |

Demo policy highlights (not production policy):

- Undelivered **delayed** orders may refund/cancel automatically under threshold **USD 100**.
- Amounts above the threshold set `requiresApproval: true`.
- Delivered orders outside **14 days** are ineligible for refund (reply-only).
- Duplicate cancellation on cancelled orders is blocked.

## Observability

Expected TOOL steps (when applicable):

1. **Lookup node** — `support_get_customer_tool`, `support_get_order_tool`, optional `support_get_shipment_tool`
2. **Action node** — `support_issue_refund_tool` or `support_cancel_order_tool`

Action tools mutate an in-memory demo ledger only. Data tools read fixtures.

## Prerequisites

- Node.js 24+ and pnpm 12.4.1
- OSVA OSS 1.0.0 web, worker, workflow orchestrator
- API key with connector/tool, agent, workflow, and approval permissions
- Worker reachability to `OSVA_SUPPORT_MCP_CONNECTOR_URL` and `OSVA_SUPPORT_RUNTIME_URL`

Local development typically requires `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true` when the worker calls loopback MCP/runtime URLs.

## Configure

Export values from `.env.example`. Required:

- `OSVA_BASE_URL`
- `OSVA_API_KEY`
- `OSVA_SUPPORT_MCP_CONNECTOR_URL`
- `OSVA_SUPPORT_RUNTIME_URL`

Optional ticket input:

- `OSVA_SUPPORT_CUSTOMER_ID` (default `cust-demo-001`)
- `OSVA_SUPPORT_MESSAGE`

Interactive approval is default; use `OSVA_AUTO_APPROVE=true` only for scripted demos.

## Build and run

```bash
pnpm install
pnpm --filter @osva-examples/06-customer-support-worker build
pnpm example:06
```

## Expected output shape

```json
{
  "workspaceId": "<workspace id>",
  "workflowRunId": "<workflow run id>",
  "approvalRequestId": "<optional approval id>",
  "approvalDecision": "APPROVED",
  "status": "SUCCEEDED",
  "route": "auto-action",
  "response": "Hello Alex Demo, your refund of USD 40.00 has been approved and processed in the demo system. ...",
  "childRuns": [
    {
      "node": "lookup-context",
      "runId": "<child run id>",
      "steps": [{ "kind": "TOOL", "bindingName": "support_get_customer_tool", "status": "SUCCEEDED" }]
    }
  ]
}
```

High-value scenarios include `approvalRequestId` and route `needs-approval`.

## Approvals (OSVA 1.0)

Approvals support **approve/reject only** (no in-platform edit of the proposed action). The approval description summarizes customer, order, action, amount, and demo policy reasoning.

When an approval decision is merged into the workflow envelope as `approvalDecision`, rejections skip side-effect tools and the response explains that no action was applied. Hermetic tests cover rejection explicitly; live merge behavior depends on your OSVA 1.0 workflow output shape.

## Limitations

- Deterministic keyword classifier (not an LLM).
- Fixture-backed commerce data only.
- Demo policy rules only.
- No Zendesk/Intercom/Shopify/Stripe/OMS integrations.
- Escalations are local records, not external tickets.

## Future extensions

- Shopify / commerce platform and OMS connectors
- Shipping carrier tracking APIs
- Zendesk / Intercom / Jira escalation
- CRM context and conversation history
- Payment gateway refunds (with idempotency keys)
- Slack paging for sensitive approvals
- Fraud/risk engine before auto-action
- Model-backed classification and response drafting with policy guardrails

## Cleanup

Remove ephemeral OSVA resources created for the run (connectors, agents, workflows) according to your workspace retention practices. No external systems were modified.
