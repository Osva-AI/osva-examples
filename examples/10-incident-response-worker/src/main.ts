import { formatError } from "@osva-examples/utils";

import { runIncidentResponseWorkflow } from "./app.js";

try {
  const result = await runIncidentResponseWorkflow();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Incident response worker example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
