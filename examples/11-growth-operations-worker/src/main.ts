import { formatError } from "@osva-examples/utils";

import { runGrowthOperationsWorkflow } from "./app.js";

try {
  const result = await runGrowthOperationsWorkflow();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Growth operations worker example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
