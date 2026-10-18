import { formatError } from "@osva-examples/utils";

import { runRemotePythonExample } from "./app.js";

try {
  const result = await runRemotePythonExample();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.attemptStatus !== "SUCCEEDED") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`Remote Python agent example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
