import { createStreamableHttpHandler } from "@osva-ai/connector-sdk";

import { npmResearchConnector } from "./connector.js";

export function createNpmMcpHttpHandler() {
  return createStreamableHttpHandler({ connector: npmResearchConnector });
}
