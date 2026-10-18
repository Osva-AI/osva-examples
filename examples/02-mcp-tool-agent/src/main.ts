import { formatError } from "@osva-examples/utils";

import { runMcpToolExample } from "./app.js";

try {
  const result = await runMcpToolExample();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.attemptStatus !== "SUCCEEDED") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`MCP tool-agent example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
