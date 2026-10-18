import http from "node:http";

import {
  RUNTIME_PROTOCOL_ERROR_CODES,
  RUNTIME_PROTOCOL_MAX_BODY_BYTES,
  RUNTIME_PROTOCOL_VERSION,
} from "@osva-ai/runtime-protocol";
import { createRuntimeHandler, RuntimeProtocolError } from "@osva-ai/sdk/runtime";

import type { RuntimeRoute } from "./manifest.js";
import { createRouteRuntime, reportRuntime } from "./runtime.js";

const ROUTES: readonly RuntimeRoute[] = ["plan", "market", "competitor", "customer", "synthesize", "report"];

export async function startParallelRuntimeServer(options: {
  readonly host: string;
  readonly port: number;
}): Promise<{ readonly close: () => Promise<void> }> {
  const handlers = new Map<string, ReturnType<typeof createRuntimeHandler>>();
  for (const route of ROUTES) {
    const runtime = route === "report" ? reportRuntime : createRouteRuntime(route);
    handlers.set(`/execute/${route}`, createRuntimeHandler(runtime));
  }

  const server = http.createServer((request, response) => {
    void handleRequest(request, response, handlers);
  });

  await listen(server, options.port, options.host);
  return {
    close: async () => {
      await closeServer(server);
    },
  };
}

async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  handlers: Map<string, ReturnType<typeof createRuntimeHandler>>,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "POST") {
    sendJson(response, 404, protocolFailure("Not found."));
    return;
  }

  const handler = handlers.get(url.pathname);
  if (handler === undefined) {
    sendJson(response, 404, protocolFailure("Not found."));
    return;
  }

  let raw: Buffer;
  try {
    raw = await readLimitedBody(request, RUNTIME_PROTOCOL_MAX_BODY_BYTES);
  } catch {
    sendJson(response, 413, protocolFailure("Request body exceeds maximum size."));
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    sendJson(response, 400, protocolFailure("Request body must be valid JSON."));
    return;
  }

  try {
    const result = await handler.handleExecuteRequest(body);
    sendJson(response, 200, result);
  } catch (error) {
    if (error instanceof RuntimeProtocolError) {
      sendJson(response, 400, {
        protocolVersion: RUNTIME_PROTOCOL_VERSION,
        outcome: "FAILED",
        error: { code: error.code, message: error.message },
      });
      return;
    }
    sendJson(response, 500, protocolFailure("Internal runtime handler failure."));
  }
}

function listen(server: http.Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", () => resolve());
    server.listen(port, host);
  });
}

function closeServer(server: http.Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

async function readLimitedBody(request: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new Error("Body too large.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function protocolFailure(message: string) {
  return {
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    outcome: "FAILED" as const,
    error: {
      code: RUNTIME_PROTOCOL_ERROR_CODES.PROTOCOL_FAILURE,
      message,
    },
  };
}

function sendJson(response: http.ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}
