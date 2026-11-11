import { fileURLToPath } from "node:url";

/**
 * STDIO transports for worker-side MCP connector processes.
 * Install `@osva-ai/connector-shopify` and `@osva-ai/connector-ga4` on the worker
 * or align `OSVA_MCP_CONNECTOR_STDIO_*` overrides per connector.
 *
 * Provider credentials belong in worker environment / secret references — never in transportConfig.
 */
export function buildPublishedShopifyConnectorStdioTransport(): {
  readonly command: string;
  readonly args: readonly string[];
} {
  const stdioEntry = fileURLToPath(import.meta.resolve("@osva-ai/connector-shopify/stdio"));
  return {
    command: process.execPath,
    args: [stdioEntry],
  };
}

export function buildPublishedGa4ConnectorStdioTransport(): {
  readonly command: string;
  readonly args: readonly string[];
} {
  const stdioEntry = fileURLToPath(import.meta.resolve("@osva-ai/connector-ga4/stdio"));
  return {
    command: process.execPath,
    args: [stdioEntry],
  };
}
