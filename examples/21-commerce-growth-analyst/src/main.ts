import { formatError } from "@osva-examples/utils";

import { runCommerceGrowthAnalystExample } from "./app.js";

try {
  const result = await runCommerceGrowthAnalystExample();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(formatError(error));
  process.exitCode = 1;
}
