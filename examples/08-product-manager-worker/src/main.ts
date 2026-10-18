import { formatError } from "@osva-examples/utils";

import { runProductManagerWorkflow } from "./app.js";

try {
  const result = await runProductManagerWorkflow();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Product manager worker example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
