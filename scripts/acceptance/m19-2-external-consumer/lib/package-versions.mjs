import { readFile } from "node:fs/promises";
import path from "node:path";

import { CONSUMER_PACKAGE_VERSIONS } from "./constants.mjs";

/**
 * @param {string} consumerRoot
 * @returns {Promise<Record<string, string>>}
 */
export async function readInstalledPackageVersions(consumerRoot) {
  /** @type {Record<string, string>} */
  const versions = {};
  for (const name of Object.keys(CONSUMER_PACKAGE_VERSIONS)) {
    const pkgPath = path.join(consumerRoot, "node_modules", name, "package.json");
    try {
      const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
      versions[name] = String(pkg.version ?? "unknown");
    } catch {
      versions[name] = "missing";
    }
  }
  return versions;
}
