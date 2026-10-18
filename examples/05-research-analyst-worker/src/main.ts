import { formatError } from "@osva-examples/utils";

import { runResearchAnalystWorkflow } from "./app.js";

try {
  const result = await runResearchAnalystWorkflow();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Research analyst worker example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
