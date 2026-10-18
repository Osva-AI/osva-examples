import { formatError } from "@osva-examples/utils";

import { runSeoWorkerWorkflow } from "./app.js";

try {
  const result = await runSeoWorkerWorkflow();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`SEO worker example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
