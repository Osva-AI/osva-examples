# 04 SEO worker

## What this teaches

This example models an employee-like **SEO worker** on OSVA OSS 1.0 using only public contracts, SDK resources, Runtime Protocol helpers, connector SDK, and `/v1` APIs:

```text
Inspect page (MCP tool)
  -> Analyze SEO (deterministic rules)
  -> Human approval
  -> Generate Markdown audit artifact
```

The same REMOTE_HTTP AgentVersion is reused at the three AGENT nodes. Each invocation advances a JSON envelope:

1. **Inspect** invokes a fixture-backed `fetch_page` MCP tool and stores a normalized page snapshot.
2. **Analyze** runs deterministic technical, on-page, content, and internal-linking checks, then prioritizes recommendations.
3. **Approval** pauses the workflow so an operator can approve or reject publication (OSVA 1.0 supports approve/reject only — not inline editing of findings).
4. **Report** renders a Markdown SEO audit and creates it through the public runtime artifact capability.

No paid model, crawler SaaS, or third-party SEO API is required for the default path.

## Prerequisites

- Node.js 24+ and pnpm 12.4.1
- OSVA OSS 1.0.0 web, worker, workflow orchestrator, and compatible artifact storage
- An API key that can create connectors/tools, agents, workflows, decide approvals, and read artifacts
- Worker reachability to `OSVA_SEO_MCP_CONNECTOR_URL` and `OSVA_SEO_RUNTIME_URL`

For local private REMOTE_HTTP/MCP targets, the OSVA worker typically requires `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true`. Keep that disabled in production unless explicitly justified.

## Configure

Copy `.env.example` to `.env` and export values in your shell. Required:

- `OSVA_BASE_URL`
- `OSVA_API_KEY`
- `OSVA_SEO_MCP_CONNECTOR_URL` (default local MCP endpoint)
- `OSVA_SEO_RUNTIME_URL` (default local runtime `/execute` endpoint)

Optional audit input (defaults target the built-in demo fixture URL):

- `OSVA_SEO_PAGE_URL`
- `OSVA_SEO_TARGET_KEYWORD`
- `OSVA_SEO_BUSINESS_CONTEXT`

Human approval is interactive by default. For a deliberate scripted demo only, set `OSVA_AUTO_APPROVE=true`.

## Build and run

From the repository root:

```bash
pnpm install
pnpm --filter @osva-examples/04-seo-worker build
pnpm example:04
```

The client:

1. Starts local MCP (page inspector) and Runtime Protocol servers.
2. Registers the MCP connector, discovers `fetch_page`, and imports the tool.
3. Registers an Agent + AgentVersion bound to the page tool.
4. Registers a V3 Workflow (inspect → analyze → approval → report).
5. Starts the WorkflowRun with `{ url, targetKeyword, businessContext? }`.
6. Polls until a pending ApprovalRequest appears, prompts for a decision, and submits it.
7. Polls to workflow completion, downloads the Markdown artifact, and prints child run step activity.

## Expected output shape

```json
{
  "workspaceId": "<workspace id>",
  "workflowRunId": "<workflow run id>",
  "approvalRequestId": "<approval id>",
  "status": "SUCCEEDED",
  "artifactId": "<artifact id>",
  "artifactPath": "<local output path>",
  "recommendationCount": 12,
  "childRuns": [
    {
      "node": "inspect-page",
      "runId": "<child run id>",
      "attemptId": "<attempt id>",
      "steps": [{ "kind": "TOOL", "bindingName": "page_tool", "status": "SUCCEEDED" }]
    }
  ]
}
```

The inspect step should record a `TOOL` run step for `page_tool`. Analyze/report agents use deterministic local logic (no model step). Artifact creation is shown via the artifact API, not as a run-step kind.

## Deterministic / local behavior

- **Page inspection** reads from in-repo fixtures (`https://example.test/products/cloud-backup` maps to a rich demo page with intentional SEO gaps). Unknown URLs receive a minimal generic fixture — still no live HTTP from tests or CI.
- **SEO analysis** is rule-based TypeScript (title/canonical/meta/H1/headings/alt text, keyword alignment, thin content, internal links, etc.).
- **Prioritization** uses a transparent severity × impact ÷ effort score — no fabricated “SEO score” metrics.

To plug in live crawling later, replace `executeFetchPage` in `src/connector.ts` (or register a different connector version) while keeping the normalized `PageSnapshot` shape.

## Common failures

- Workflow stuck before approval: verify worker reachability to the runtime URL and inspect/analyze child runs.
- Approval never appears: confirm analyze node succeeded and orchestrator logs.
- MCP/tool failure: verify worker reachability to the MCP URL and private-network opt-in.
- Artifact download failure: verify artifact storage configuration across web and worker services.

## Cleanup

Local servers close in a `finally` block. Remove downloaded artifacts when finished:

```bash
rm -rf output
```

OSVA registry records are durable; stable 1.0 does not expose general deletion APIs for them.

## Limitations (V1)

- Fixture-backed inspection only (no Search Console, GA4, SERP, or CMS writes).
- Approve/reject gate only — operators cannot edit individual findings inside OSVA 1.0 approval UI.
- Rule-based analysis — not a substitute for a commercial site crawler or rank tracker.

## Extension ideas

| Integration                | Role                                       |
| -------------------------- | ------------------------------------------ |
| Real HTTP/HTML crawler     | Replace fixture handler in `fetch_page`    |
| Google Search Console      | Impressions, queries, coverage issues      |
| GA4                        | Landing-page engagement signals            |
| SERP provider              | Competitive snippet/intent context         |
| CMS connector              | Publish meta fixes or draft content        |
| Schedules / office workers | Recurring audits and regression monitoring |

Optional model-backed narrative summaries can be added in a separate AgentVersion with `capabilities.model: true` when a workspace model binding is available — keep them out of the default hermetic path.
