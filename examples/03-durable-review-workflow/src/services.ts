import type http from "node:http";

import { createNodeHttpServer } from "@osva-ai/sdk/runtime";

import { reviewRuntime } from "./runtime.js";

export async function startReviewRuntime(options: {
  readonly host: string;
  readonly port: number;
}): Promise<{ readonly close: () => Promise<void> }> {
  const server = createNodeHttpServer(reviewRuntime);
  await listen(server, options.port, options.host);
  return { close: () => closeServer(server) };
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
