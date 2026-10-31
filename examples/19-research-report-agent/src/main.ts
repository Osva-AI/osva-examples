import { formatError } from "@osva-examples/utils";

import { runResearchReportExample } from "./app.js";

try {
  const result = await runResearchReportExample();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(formatError(error));
  process.exitCode = 1;
}
