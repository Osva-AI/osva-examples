import { createStreamableHttpHandler } from "@osva-ai/connector-sdk";
import { createNpmConnector } from "@osva-ai/connector-npm";

/**
 * Local loopback Streamable HTTP bridge for REMOTE_HTTP demos.
 * `@osva-ai/connector-npm` ships STDIO only; tool logic comes from the published connector.
 */
export function createNpmMcpHttpHandler() {
  return createStreamableHttpHandler({ connector: createNpmConnector() });
}
