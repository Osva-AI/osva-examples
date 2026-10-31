import { fileURLToPath } from "node:url";

/**
 * STDIO transport config for OSVA MCP connector versions.
 * Paths are resolved from this package's dependency tree at bootstrap time;
 * the OSVA worker host must be able to execute the same command (install
 * `@osva-ai/connector-npm` on the worker or align `node` + entry paths).
 */
export function buildPublishedNpmConnectorStdioTransport(): {
  readonly command: string;
  readonly args: readonly string[];
} {
  const stdioEntry = fileURLToPath(import.meta.resolve("@osva-ai/connector-npm/stdio"));
  return {
    command: process.execPath,
    args: [stdioEntry],
  };
}
