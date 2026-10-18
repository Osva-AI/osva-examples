import type { Server } from "node:http";

import { createNodeHttpServer } from "@osva-ai/sdk/runtime";

import { modelPoweredRuntime } from "./runtime.js";

export interface ExampleServices {
  readonly close: () => Promise<void>;
}

export async function startExampleServices(options: {
  readonly host: string;
  readonly runtimePort: number;
  readonly capabilityTimeoutMs?: number;
}): Promise<ExampleServices> {
  const runtimeServer = createNodeHttpServer(modelPoweredRuntime, {
    capabilityTimeoutMs: options.capabilityTimeoutMs,
  });

  try {
    await listen(runtimeServer, options.runtimePort, options.host);
  } catch (error) {
    await closeServer(runtimeServer);
    throw error;
  }

  return {
    close: async () => {
      await closeServer(runtimeServer);
    },
  };
}

function listen(server: Server, port: number, host: string): Promise<void> {
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

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}
