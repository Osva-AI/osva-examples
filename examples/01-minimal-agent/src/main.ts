import { formatError } from "@osva-examples/utils";

import { runMinimalAgent } from "./app.js";

try {
  const result = await runMinimalAgent();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.attemptStatus !== "SUCCEEDED") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`Minimal agent example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
