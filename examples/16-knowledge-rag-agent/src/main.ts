import { formatError } from "@osva-examples/utils";

import { runKnowledgeRagExample } from "./app.js";

try {
  const result = await runKnowledgeRagExample();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.attemptStatus !== "SUCCEEDED") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`Knowledge RAG example failed: ${formatError(error)}\n`);
  process.exitCode = 1;
}
