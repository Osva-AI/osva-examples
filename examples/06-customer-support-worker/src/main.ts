import { formatError } from "@osva-examples/utils";

import { runCustomerSupportWorkflow } from "./app.js";

try {
  const result = await runCustomerSupportWorkflow();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Customer support worker example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
