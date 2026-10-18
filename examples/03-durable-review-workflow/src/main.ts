import { formatError } from "@osva-examples/utils";

import { runDurableReviewWorkflow } from "./app.js";

try {
  const result = await runDurableReviewWorkflow();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Durable review workflow example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
