import { formatError } from "@osva-examples/utils";

import { runFailureRecoveryExample } from "./app.js";

try {
  const result = await runFailureRecoveryExample();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.finalAttemptStatus !== "SUCCEEDED") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`Failure recovery example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
