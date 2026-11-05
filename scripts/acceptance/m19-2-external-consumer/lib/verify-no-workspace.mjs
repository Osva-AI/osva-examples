import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const FORBIDDEN_PATTERNS = [/workspace:\*/, /"link:/, /from "@osva-examples\/utils"/, /from '@osva-examples\/utils'/];

/**
 * @param {string} consumerRoot
 * @returns {Promise<{ ok: boolean, violations: string[] }>}
 */
export async function verifyNoWorkspaceImports(consumerRoot) {
  /** @type {string[]} */
  const violations = [];

  const packageJsonPath = path.join(consumerRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const serialized = JSON.stringify(packageJson);
  if (serialized.includes("workspace:") || serialized.includes("link:")) {
    violations.push("package.json contains workspace: or link: dependencies");
  }
  if (serialized.includes("@osva-examples/utils")) {
    violations.push("package.json still references @osva-examples/utils");
  }

  await scanDirectory(path.join(consumerRoot, "src"), violations);
  await scanDirectory(path.join(consumerRoot, "test"), violations);

  return { ok: violations.length === 0, violations };
}

/**
 * @param {string} directory
 * @param {string[]} violations
 */
async function scanDirectory(directory, violations) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      await scanDirectory(full, violations);
      continue;
    }
    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".json")) continue;
    const content = await readFile(full, "utf8");
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(`${path.relative(directory, full) || entry.name}: matched ${pattern}`);
      }
    }
  }
}
