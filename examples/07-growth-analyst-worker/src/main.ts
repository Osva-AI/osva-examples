import { formatError } from "@osva-examples/utils";

import { runGrowthAnalystWorkflow } from "./app.js";

try {
  const result = await runGrowthAnalystWorkflow();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Growth analyst worker example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
