import http from "node:http";

import { createMcpHandler } from "@modelcontextprotocol/server";
import { hostHeaderValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpServerFromConnector } from "@osva-ai/connector-sdk";
import { createNpmConnector } from "@osva-ai/connector-npm";

import { NPM_MCP_HTTP_ALLOWED_HOSTNAMES } from "./mcp-http-hosts.js";

/**
 * Local Streamable HTTP bridge for REMOTE_HTTP demos.
 * `@osva-ai/connector-npm` ships STDIO only; tool logic comes from the published connector.
 *
 * Host validation uses the MCP Node middleware allowlist (not disabled). Docker Desktop
 * development adds `host.docker.internal`; see `NPM_MCP_HTTP_ALLOWED_HOSTNAMES`.
 *
 * `@osva-ai/connector-sdk@1.1.3` `createStreamableHttpHandler()` does not expose
 * `allowedHostnames`; this example composes the same handler stack with a documented
 * development allowlist until the SDK adds a configuration option.
 */
export function createNpmMcpHttpHandler(): {
  readonly path: string;
  handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void>;
  close(): Promise<void>;
} {
  const path = "/mcp";
  const handler = createMcpHandler(() => createMcpServerFromConnector(createNpmConnector()));
  const mcpHandler = toNodeHandler(handler);
  const validateHost = hostHeaderValidation([...NPM_MCP_HTTP_ALLOWED_HOSTNAMES]);

  return {
    path,
    async handle(request, response) {
      if (!validateHost(request, response)) {
        return;
      }
      const urlPath = request.url?.split("?")[0] ?? "";
      if (urlPath !== path && urlPath !== `${path}/`) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "not_found" }));
        return;
      }
      try {
        await mcpHandler(request, response);
      } catch {
        if (!response.headersSent) {
          response.writeHead(500, { "content-type": "application/json" });
          response.end(JSON.stringify({ status: "internal_error" }));
        }
      }
    },
    async close() {
      await handler.close();
    },
  };
}
