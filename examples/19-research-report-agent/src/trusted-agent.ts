import { runResearchReportAgent } from "./agent.js";
import type { TrustedResearchReportContext } from "./agent-types.js";

/** TRUSTED_TYPESCRIPT entrypoint (OSVA 1.1+ worker trusted runtime). */
export async function run(context: TrustedResearchReportContext) {
  return runResearchReportAgent(context);
}
