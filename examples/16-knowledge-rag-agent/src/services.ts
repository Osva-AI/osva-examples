import type { Server } from "node:http";

import { createNodeHttpServer } from "@osva-ai/sdk/runtime";

import { knowledgeRagRuntime } from "./runtime.js";

export async function startExampleServices(options: {
  readonly host: string;
  readonly runtimePort: number;
}): Promise<{ readonly close: () => Promise<void> }> {
  const server = createNodeHttpServer(knowledgeRagRuntime);
  await listen(server, options.runtimePort, options.host);
  return { close: async () => closeServer(server) };
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", () => resolve());
    server.listen(port, host);
  });
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}
