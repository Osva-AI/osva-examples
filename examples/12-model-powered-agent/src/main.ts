import { formatError } from "@osva-examples/utils";

import { runModelPoweredExample } from "./app.js";

try {
  const result = await runModelPoweredExample();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.attemptStatus !== "SUCCEEDED") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`Model-powered agent example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
