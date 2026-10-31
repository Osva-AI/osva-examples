/**
 * Hostnames permitted for the Example 19 Streamable HTTP MCP bridge in local development.
 *
 * `@osva-ai/connector-sdk` `createStreamableHttpHandler()` only allows loopback hostnames.
 * Containerized OSVA (Docker Desktop) calls the host-published bridge with
 * `Host: host.docker.internal`, which requires an explicit allowlist via
 * `@modelcontextprotocol/node` `hostHeaderValidation()` (same primitive the SDK uses).
 */
export const NPM_MCP_HTTP_ALLOWED_HOSTNAMES: readonly string[] = [
  "localhost",
  "127.0.0.1",
  "[::1]",
  "host.docker.internal",
];
