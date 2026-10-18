# 02 MCP tool-enabled agent

## What this teaches

This example keeps the important boundaries visible:

```text
external setup client
  -> authenticated OSVA /v1 connector APIs
  -> ToolVersion bound into an AgentVersion
  -> OSVA invokes REMOTE_HTTP agent runtime
  -> agent calls context.tools.invoke("text_tool")
  -> OSVA ToolGateway invokes local MCP connector
```

The safe MCP capability only normalizes text. It requires no paid account and receives no OSVA API key. The agent prompt/input also receives no connector credential or capability token. OSVA injects the short-lived runtime capability credential at the runtime-protocol boundary.

## Prerequisites

- Node.js 24+ and pnpm 12.4.1
- OSVA OSS 1.0.0 web and worker services
- An API key with the permissions needed to create/discover/import connectors and execute runs. The bootstrap/admin key is suitable for a local development stack.
- OSVA worker network reachability to the MCP and REMOTE_HTTP URLs

For a loopback-only local stack, OSVA blocks private-network destinations unless the operator deliberately enables the stable development opt-ins:

```text
OSVA_MCP_CONNECTOR_ALLOW_PRIVATE_NETWORKS=true
OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true
```

Do not copy those settings into production without a threat-model decision. A Dockerized worker cannot reach the host's `127.0.0.1`; use addresses appropriate to your local topology. The stable connector SDK's HTTP helper performs localhost Host validation, so the simplest supported run is OSVA services and this example on the same host/network namespace.

## Configure

Export the variables in `.env.example`. Required variables are `OSVA_BASE_URL`, `OSVA_API_KEY`, `OSVA_MCP_CONNECTOR_URL`, and `OSVA_AGENT_RUNTIME_URL`.

The process listens on loopback by default. `OSVA_EXAMPLE_LISTEN_HOST`, MCP/runtime ports, input text, polling timeout, and interval are optional.

`OSVA_MCP_CONNECTOR_URL` must point to the example connector's `/mcp` endpoint as seen by OSVA. `OSVA_AGENT_RUNTIME_URL` must point to the example runtime's `/execute` endpoint as seen by the worker.

## Build and run

From the repository root:

```bash
pnpm install
pnpm --filter @osva-examples/02-mcp-tool-agent build
pnpm example:02
```

The example starts both local servers, registers the connector and AgentVersion through public boundaries, runs the agent, queries public run-step observability, then closes both servers in a `finally` path.

## Expected output shape

```json
{
  "workspaceId": "<workspace id from /v1/auth/context>",
  "connectorId": "<connector id>",
  "connectorVersionId": "<connector version id>",
  "toolVersionId": "<imported MCP tool version id>",
  "agentId": "<agent id>",
  "agentVersionId": "<agent version id>",
  "runId": "<run id>",
  "attemptStatus": "SUCCEEDED",
  "output": {
    "input": "...",
    "toolResult": {}
  },
  "toolActivity": [
    {
      "kind": "TOOL",
      "bindingName": "text_tool",
      "status": "SUCCEEDED"
    }
  ],
  "polling": {
    "attempts": 1,
    "elapsedMs": 0
  }
}
```

Actual IDs, output fields returned by MCP, attempts, and timing are generated at runtime.

## Common failures

- 401/403: API-key authentication or authorization is insufficient.
- MCP discovery cannot reach `OSVA_MCP_CONNECTOR_URL`: check the worker/web network route, local listener, private-network policy, and Host validation.
- REMOTE_HTTP execution cannot reach `OSVA_AGENT_RUNTIME_URL`: check worker routing and `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS` for an explicitly local development deployment.
- Missing `normalize_text` from discovery: the MCP endpoint is wrong or is not this example connector.
- Terminal `FAILED`: inspect `toolActivity`, the RunAttempt error, and OSVA worker logs without printing secrets.

## Cleanup

The example deterministically closes its local runtime and MCP servers even on failure. OSVA 1.0 public registry APIs do not expose deletion for the immutable example versions created here, so connector, tool, agent, and run records remain as durable audit/demo data. Repeated runs use unique keys to avoid collisions.
