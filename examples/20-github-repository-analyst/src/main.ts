import { formatError } from "@osva-examples/utils";

import { runRepositoryAnalystExample } from "./app.js";

try {
  const result = await runRepositoryAnalystExample();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(formatError(error));
  process.exitCode = 1;
}
