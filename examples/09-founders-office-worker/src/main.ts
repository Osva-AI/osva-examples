import { formatError } from "@osva-examples/utils";

import { runFoundersOfficeWorkflow } from "./app.js";

try {
  const result = await runFoundersOfficeWorkflow();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Founder's office worker example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
