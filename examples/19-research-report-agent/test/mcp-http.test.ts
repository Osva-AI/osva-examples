import http from "node:http";

import { describe, expect, it, afterEach } from "vitest";

import { createNpmMcpHttpHandler } from "../src/connector/mcp-http.js";

describe("npm MCP HTTP bridge Host validation", () => {
  let server: http.Server | undefined;
  let bridge: ReturnType<typeof createNpmMcpHttpHandler> | undefined;

  afterEach(async () => {
    if (bridge !== undefined) {
      await bridge.close();
      bridge = undefined;
    }
    if (server === undefined) return;
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error === undefined ? resolve() : reject(error)));
    });
    server = undefined;
  });

  it("allows host.docker.internal (Docker Desktop worker → host bridge)", async () => {
    bridge = createNpmMcpHttpHandler();
    const activeBridge = bridge;
    server = http.createServer((request, response) => {
      void activeBridge.handle(request, response);
    });
    const port = await listen(server);

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        Host: "host.docker.internal",
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "mcp-http.test", version: "1" },
        },
        id: 1,
      }),
    });

    expect(response.status).not.toBe(403);
    const body = await response.text();
    expect(body).not.toContain("Invalid Host");
  });

  it("rejects an arbitrary Host header", async () => {
    bridge = createNpmMcpHttpHandler();
    const activeBridge = bridge;
    server = http.createServer((request, response) => {
      void activeBridge.handle(request, response);
    });
    const port = await listen(server);

    const { statusCode, body } = await rawRequest({
      host: "127.0.0.1",
      port,
      method: "GET",
      path: "/mcp",
      headers: { Host: "attacker.example.test" },
    });

    expect(statusCode).toBe(403);
    expect(body).toContain("Invalid Host");
  });
});

function rawRequest(options: {
  readonly host: string;
  readonly port: number;
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string>;
}): Promise<{ readonly statusCode: number; readonly body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: options.host,
        port: options.port,
        method: options.method,
        path: options.path,
        headers: options.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Expected server to listen on a TCP port."));
        return;
      }
      resolve(address.port);
    });
  });
}
