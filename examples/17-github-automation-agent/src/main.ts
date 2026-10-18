import { formatError } from "@osva-examples/utils";

import { runGitHubAutomationExample } from "./app.js";

try {
  const result = await runGitHubAutomationExample();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.attemptStatus !== "SUCCEEDED") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`GitHub automation example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
