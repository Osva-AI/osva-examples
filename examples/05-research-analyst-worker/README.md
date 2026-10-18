# 05 Research analyst worker

## What this teaches

This example models an employee-like **research analyst** on OSVA OSS 1.0. It is intentionally different from the SEO worker: the focus is **multi-step research**, **evidence traceability**, **specialist stages**, **contradiction review**, and **synthesis** — not a single prompt or single audit pass.

```text
Plan research
  -> Collect sources (MCP fixture search)
  -> Extract evidence
  -> Analyze themes
  -> Review evidence / conflicts
  -> Human approval
  -> Write Markdown research report
```

Each stage is a separate V3 workflow AGENT node. One REMOTE_HTTP AgentVersion implements role-specific behavior by advancing a structured JSON envelope (planner → collector → researcher → analyst → reviewer → reporter). The collector stage invokes an MCP `search_sources` tool so runs expose a `TOOL` step in observability, similar to Example 04.

No paid models, live web search, or external credentials are required for the default path.

## Why multiple roles

| Workflow node      | Specialist role   | Output                                                          |
| ------------------ | ----------------- | --------------------------------------------------------------- |
| `plan-research`    | Planner           | Sub-questions and evidence checklist                            |
| `collect-sources`  | Source collector  | Fixture corpus matches via MCP tool                             |
| `extract-evidence` | Researcher        | Traceable evidence records per source                           |
| `analyze-themes`   | Analyst           | Theme findings with rule-based confidence                       |
| `review-evidence`  | Evidence reviewer | Conflicts, weak evidence, coverage gaps; confidence adjustments |
| `human-approval`   | Human operator    | Approve/reject publication                                      |
| `write-report`     | Report writer     | Markdown artifact with source references                        |

## Prerequisites

- Node.js 24+ and pnpm 12.4.1
- OSVA OSS 1.0.0 web, worker, workflow orchestrator, artifact storage
- API key with connector/tool, agent, workflow, approval, and artifact permissions
- Worker reachability to `OSVA_RESEARCH_MCP_CONNECTOR_URL` and `OSVA_RESEARCH_RUNTIME_URL`

Local development typically requires `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true` when the worker calls loopback MCP/runtime URLs.

## Configure

Export values from `.env.example`. Required:

- `OSVA_BASE_URL`
- `OSVA_API_KEY`
- `OSVA_RESEARCH_MCP_CONNECTOR_URL`
- `OSVA_RESEARCH_RUNTIME_URL`

Optional research input:

- `OSVA_RESEARCH_QUESTION`
- `OSVA_RESEARCH_OBJECTIVE`
- `OSVA_RESEARCH_AUDIENCE`

Interactive approval is default; use `OSVA_AUTO_APPROVE=true` only for scripted demos.

## Build and run

```bash
pnpm install
pnpm --filter @osva-examples/05-research-analyst-worker build
pnpm example:05
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
  "themeCount": 3,
  "issueCount": 4,
  "childRuns": [
    {
      "node": "collect-sources",
      "runId": "<child run id>",
      "steps": [{ "kind": "TOOL", "bindingName": "research_source_tool", "status": "SUCCEEDED" }]
    }
  ]
}
```

## Fixture-backed behavior

The MCP connector searches a **synthetic in-repo corpus** (fictional publishers and URLs). Sources include overlapping themes, a weak vendor claim, and a deliberate timeline conflict between vendor marketing and buyer advisory notes. Conflicting evidence records remain in the envelope and appear in the final report.

This demonstrates orchestration and evidence handling — not real-time web research.

## Source and evidence model

- **Sources** — `id`, `title`, `publisher`, optional `url`, `content`, structured `snippets`
- **Evidence** — every claim references a `sourceId`; optional `contradicts` links opposing records
- **Analysis** — themes with `supportingEvidenceIds` and rule-based `confidence` (`high` / `medium` / `low`)
- **Review** — issues typed as `unsupported`, `conflict`, `weak-evidence`, or `coverage-gap`

## Human approval

Approval pauses after `review-evidence`. OSVA 1.0 supports **approve/reject only** — operators cannot edit findings inside the approval UI. Reject stops publication of the Markdown artifact.

## OSVA primitives demonstrated

- V3 workflow with six AGENT nodes + APPROVAL
- MCP connector registration and tool import (`search_sources`)
- REMOTE_HTTP runtime with tool + artifact capabilities
- Structured envelope handoffs between nodes
- Approval gate before artifact creation
- Child run step observability (`TOOL` on collection; deterministic logic on other nodes)

## Observability expectations

- Workflow node list shows each specialist stage in order
- `collect-sources` child run should include a `TOOL` step bound to `research_source_tool`
- Other agent nodes run deterministic TypeScript (no model steps in V1)
- Artifact creation appears via the artifact API, not as a run-step kind

## Limitations (V1)

- No live web search, browser fetch, vector RAG, or academic databases
- Rule-based planner/analyst/reviewer — not LLM reasoning
- Synthetic sources only
- Approve/reject gate without inline editing

## Future extensions

- Live web search or page-fetch connectors
- Internal document / CRM sources
- Knowledge indexes and RAG bindings
- Model-backed reasoning on selected stages (separate AgentVersion with model capability)
- Recurring monitoring via schedules or office workers
- Delivery connectors (email, Slack)

## Cleanup

```bash
rm -rf output
```

Registry and run records remain in OSVA; stable 1.0 does not provide general deletion APIs for them.
