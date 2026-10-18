import { formatError } from "@osva-examples/utils";

import { runParallelResearchWorkflow } from "./app.js";

try {
  const result = await runParallelResearchWorkflow();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "SUCCEEDED") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`Parallel research workflow example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
