import { serveStdio } from "@osva-ai/connector-sdk";

import { npmResearchConnector } from "./connector.js";

await serveStdio(npmResearchConnector);
