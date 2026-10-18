import { afterEach, describe, expect, it } from "vitest";

import { RUNTIME_PROTOCOL_VERSION, runtimeExecuteResponseSchema } from "@osva-ai/runtime-protocol";

import { resolvePythonLaunch, startPythonRuntime } from "../src/python-runtime.js";

const pythonAvailable = await resolvePythonLaunch(process.env)
  .then(() => true)
  .catch(() => false);

describe.runIf(pythonAvailable)("Python REMOTE_HTTP runtime protocol (hermetic)", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it("accepts a valid execute request and returns structured output", async () => {
    const host = "127.0.0.1";
    const port = 20_000 + Math.floor(Math.random() * 10_000);
    const runtime = await startPythonRuntime({ host, port });
    close = runtime.close;

    const response = await fetch(`http://${host}:${String(port)}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        protocolVersion: RUNTIME_PROTOCOL_VERSION,
        executionId: "exec_python_test",
        input: { text: "  hello osva  " },
        capabilities: { endpoint: "http://capabilities.test", token: "capability-token" },
      }),
    });

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    const parsed = runtimeExecuteResponseSchema.parse(body);
    expect(parsed.outcome).toBe("SUCCEEDED");
    if (parsed.outcome === "SUCCEEDED") {
      expect(parsed.executionId).toBe("exec_python_test");
      expect(parsed.output).toEqual({
        input: "  hello osva  ",
        normalized: "HELLO OSVA",
        runtimeLanguage: "python",
      });
    }
  });

  it("returns FAILED for malformed agent input without crashing", async () => {
    const host = "127.0.0.1";
    const port = 30_000 + Math.floor(Math.random() * 10_000);
    const runtime = await startPythonRuntime({ host, port });
    close = runtime.close;

    const response = await fetch(`http://${host}:${String(port)}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        protocolVersion: RUNTIME_PROTOCOL_VERSION,
        executionId: "exec_python_bad_input",
        input: { text: 123 },
        capabilities: { endpoint: "http://capabilities.test", token: "capability-token" },
      }),
    });

    const body: unknown = await response.json();
    const parsed = runtimeExecuteResponseSchema.parse(body);
    expect(parsed.outcome).toBe("FAILED");
  });
});

describe.skipIf(pythonAvailable)("Python REMOTE_HTTP runtime protocol (hermetic)", () => {
  it("documents why protocol tests are skipped when Python is unavailable", () => {
    expect(process.env["OSVA_EXAMPLE_PYTHON"] ?? "PATH").toBeTruthy();
  });
});
