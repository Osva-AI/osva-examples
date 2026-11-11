import { runCommerceGrowthAnalystAgent } from "./agent.js";
import type { TrustedCommerceGrowthContext } from "./agent-types.js";

/** TRUSTED_TYPESCRIPT entrypoint (OSVA 1.1+ worker trusted runtime). */
export async function run(context: TrustedCommerceGrowthContext) {
  return runCommerceGrowthAnalystAgent(context);
}
