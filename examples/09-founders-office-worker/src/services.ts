import http from "node:http";

import { createStreamableHttpHandler } from "@osva-ai/connector-sdk";
import { createNodeHttpServer } from "@osva-ai/sdk/runtime";

import { companyOpsConnector } from "./connector.js";
import { foundersOfficeRuntime } from "./runtime.js";

export interface FoundersOfficeServices {
  readonly close: () => Promise<void>;
}

export async function startFoundersOfficeServices(options: {
  readonly host: string;
  readonly mcpPort: number;
  readonly runtimePort: number;
}): Promise<FoundersOfficeServices> {
  const mcpHandler = createStreamableHttpHandler({ connector: companyOpsConnector });
  const mcpServer = http.createServer((request, response) => {
    void mcpHandler.handle(request, response);
  });
  const runtimeServer = createNodeHttpServer(foundersOfficeRuntime);

  try {
    await listen(mcpServer, options.mcpPort, options.host);
    await listen(runtimeServer, options.runtimePort, options.host);
  } catch (error) {
    await closeServer(runtimeServer);
    await closeServer(mcpServer);
    await mcpHandler.close();
    throw error;
  }

  return {
    close: async () => {
      await closeServer(runtimeServer);
      await closeServer(mcpServer);
      await mcpHandler.close();
    },
  };
}

function listen(server: http.Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function closeServer(server: http.Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}
