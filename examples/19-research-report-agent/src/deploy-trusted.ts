import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SHA256_INTEGRITY_PREFIX } from "@osva-ai/contracts";

export class TrustedDeployError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrustedDeployError";
  }
}

export interface DeployedTrustedAgent {
  readonly bundleDir: string;
  readonly entrypointPosix: string;
  readonly integrity: string;
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(packageRoot, "dist");
const distTrustedEntry = path.join(distDir, "trusted-agent.js");

export async function deployTrustedResearchAgent(trustedRuntimeRoot: string): Promise<DeployedTrustedAgent> {
  await access(distTrustedEntry);

  const bundleDir = path.join(trustedRuntimeRoot, "osva-examples", "19-research-report-agent");
  await mkdir(bundleDir, { recursive: true });
  await cp(distDir, bundleDir, { recursive: true, force: true });

  const entrypointFile = path.join(bundleDir, "trusted-agent.js");
  await import(pathToFileURL(entrypointFile).href);

  const bytes = await readFile(entrypointFile);
  const digest = createHash("sha256").update(bytes).digest("hex");

  return {
    bundleDir,
    entrypointPosix: "osva-examples/19-research-report-agent/trusted-agent.js",
    integrity: `${SHA256_INTEGRITY_PREFIX}${digest}`,
  };
}
