import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EXAMPLE_20_PACKAGE_VERSIONS } from "./lib/constants.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PKG_PATH = path.join(ROOT, "examples", "20-github-repository-analyst", "package.json");

const pkg = JSON.parse(await readFile(PKG_PATH, "utf8"));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

const failures = [];
for (const [name, want] of Object.entries(EXAMPLE_20_PACKAGE_VERSIONS)) {
  const have = deps[name];
  if (have !== want) {
    failures.push(`${name} expected ${want}, got ${have ?? "missing"}`);
  }
}

for (const name of Object.keys(deps)) {
  if (name.startsWith("@osva-ai/") && EXAMPLE_20_PACKAGE_VERSIONS[name] === undefined) {
    failures.push(`unexpected OSVA dependency ${name}@${deps[name]}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`Example 20 package pin verification failed:\n${failures.map((f) => `- ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Example 20 published package pin verification passed.\n");
}
