import { formatError } from "@osva-examples/utils";

import { runScheduledReportingExample } from "./app.js";

try {
  const result = await runScheduledReportingExample();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.demoAttemptStatus !== "SUCCEEDED") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`Scheduled reporting example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
