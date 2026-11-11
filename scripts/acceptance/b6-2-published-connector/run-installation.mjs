#!/usr/bin/env node
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { EXAMPLE_20_PACKAGE_VERSIONS, EXAMPLE_21_PACKAGE_VERSIONS } from "./lib/constants.mjs";
import { materializeExampleConsumer, REPO_ROOT } from "./lib/materialize-example-consumer.mjs";
import { readFile } from "node:fs/promises";
import { runCommand } from "../m19-2-external-consumer/lib/run-command.mjs";
import { verifyNoWorkspaceImports } from "../m19-2-external-consumer/lib/verify-no-workspace.mjs";

const EXAMPLE_TARGETS = [
  {
    label: "Example 20",
    folder: "20-github-repository-analyst",
    packageName: "example-20-github-repository-analyst-external-consumer",
    dependencyPins: EXAMPLE_20_PACKAGE_VERSIONS,
  },
  {
    label: "Example 21",
    folder: "21-commerce-growth-analyst",
    packageName: "example-21-commerce-growth-analyst-external-consumer",
    dependencyPins: EXAMPLE_21_PACKAGE_VERSIONS,
  },
];

const failures = [];
const keepTemp = process.argv.includes("--keep-temp");

for (const target of EXAMPLE_TARGETS) {
  const destRoot = await mkdtemp(path.join(os.tmpdir(), `b62-${target.folder}-`));
  console.log(`Materializing ${target.label} consumer at ${destRoot}`);
  try {
    await materializeExampleConsumer(target, destRoot);

    const workspaceScan = await verifyNoWorkspaceImports(destRoot);
    if (!workspaceScan.ok) {
      failures.push(`${target.label}: workspace import scan failed: ${workspaceScan.violations.join(", ")}`);
      continue;
    }

    const install = await runCommand("npm", ["install", "--no-fund", "--no-audit"], { cwd: destRoot });
    if (install.code !== 0) {
      throw new Error(`npm install failed:\n${install.stderr}\n${install.stdout}`);
    }

    const installed = await readInstalledPackageVersions(destRoot, target.dependencyPins);
    for (const [name, want] of Object.entries(target.dependencyPins)) {
      const have = installed[name];
      if (have !== want) {
        failures.push(`${target.label}: installed ${name} expected ${want}, got ${have ?? "missing"}`);
      }
    }

    for (const step of [
      ["npm", ["run", "typecheck"]],
      ["npm", ["test"]],
      ["npm", ["run", "build"]],
    ]) {
      const result = await runCommand(step[0], step[1], { cwd: destRoot });
      if (result.code !== 0) {
        throw new Error(`${step[0]} ${step[1].join(" ")} failed:\n${result.stderr}\n${result.stdout}`);
      }
    }

    console.log(`${target.label}: npm installation acceptance passed.`);
  } catch (error) {
    failures.push(`${target.label}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (!keepTemp) {
      await rm(destRoot, { recursive: true, force: true });
    } else {
      console.log(`Kept consumer at ${destRoot}`);
    }
  }
}

/**
 * @param {string} consumerRoot
 * @param {Record<string, string>} expected
 */
async function readInstalledPackageVersions(consumerRoot, expected) {
  /** @type {Record<string, string>} */
  const versions = {};
  for (const name of Object.keys(expected)) {
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

if (failures.length > 0) {
  process.stderr.write(
    `B6.2 published-connector installation acceptance failed:\n${failures.map((line) => `- ${line}`).join("\n")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `B6.2 published-connector installation acceptance passed for Examples 20–21 (repo ${REPO_ROOT}).\n`,
  );
}
