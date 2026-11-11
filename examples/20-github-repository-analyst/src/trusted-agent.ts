import { runRepositoryAnalystAgent } from "./agent.js";
import type { TrustedRepositoryAnalystContext } from "./agent-types.js";

/** TRUSTED_TYPESCRIPT entrypoint (OSVA 1.1+ worker trusted runtime). */
export async function run(context: TrustedRepositoryAnalystContext) {
  return runRepositoryAnalystAgent(context);
}
