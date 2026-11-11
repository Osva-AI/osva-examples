import { fileURLToPath } from "node:url";

/**
 * STDIO transport config for OSVA MCP connector versions.
 * The OSVA worker host must execute the same command (install
 * `@osva-ai/connector-github` on the worker or align `node` + entry paths).
 * Configure `OSVA_CONNECTOR_GITHUB_TOKEN` on the worker via supported secret mechanisms.
 */
export function buildPublishedGithubConnectorStdioTransport(): {
  readonly command: string;
  readonly args: readonly string[];
} {
  const stdioEntry = fileURLToPath(import.meta.resolve("@osva-ai/connector-github/stdio"));
  return {
    command: process.execPath,
    args: [stdioEntry],
  };
}
