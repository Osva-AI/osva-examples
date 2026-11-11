import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const EXAMPLES_DIR = path.join(ROOT, "examples");
const UTILS_PKG = path.join(ROOT, "packages", "example-utils", "package.json");
const M19_CONSTANTS = path.join(ROOT, "scripts", "acceptance", "m19-2-external-consumer", "lib", "constants.mjs");

/** @type {Record<string, string | null>} */
const LEGACY_SDK_DEPS = {
  "@osva-ai/sdk": "1.0.0",
  "@osva-ai/contracts": "1.0.0",
  "@osva-ai/connector-sdk": "1.0.0",
  "@osva-ai/runtime-protocol": "1.0.0",
};

/** @type {Record<string, string>} */
const EXAMPLE_11X_CORE = {
  "@osva-ai/sdk": "1.1.4",
  "@osva-ai/contracts": "1.1.4",
  "@osva-ai/connector-sdk": "1.1.4",
};

/** @type {Record<string, string>} */
const EXAMPLE_19_DEPS = {
  ...EXAMPLE_11X_CORE,
  "@osva-ai/connector-npm": "0.1.1",
};

/** @type {Record<string, string>} */
const EXAMPLE_20_DEPS = {
  ...EXAMPLE_11X_CORE,
  "@osva-ai/connector-github": "0.4.0",
};

const B6_2_CONSTANTS = path.join(ROOT, "scripts", "acceptance", "b6-2-published-connector", "lib", "constants.mjs");

/** Expected optional legacy deps by example folder prefix (01-minimal-agent, …). */
const LEGACY_OPTIONAL = {
  "02-mcp-tool-agent": ["@osva-ai/connector-sdk"],
  "04-seo-worker": ["@osva-ai/connector-sdk"],
  "05-research-analyst-worker": ["@osva-ai/connector-sdk"],
  "06-customer-support-worker": ["@osva-ai/connector-sdk"],
  "07-growth-analyst-worker": ["@osva-ai/connector-sdk"],
  "08-product-manager-worker": ["@osva-ai/connector-sdk"],
  "09-founders-office-worker": ["@osva-ai/connector-sdk"],
  "10-incident-response-worker": ["@osva-ai/connector-sdk"],
  "11-growth-operations-worker": ["@osva-ai/connector-sdk"],
  "13-remote-python-agent": ["@osva-ai/runtime-protocol"],
  "14-parallel-research-agents": ["@osva-ai/runtime-protocol"],
};

const failures = [];

/**
 * @param {string} file
 * @returns {Promise<{ name?: string; dependencies?: Record<string, string> }>}
 */
async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

/**
 * @param {string} context
 * @param {Record<string, string | undefined>} deps
 * @param {Record<string, string | null>} expected
 */
function assertDeps(context, deps, expected) {
  for (const [name, want] of Object.entries(expected)) {
    const have = deps[name];
    if (want === null) {
      if (have !== undefined) {
        failures.push(`${context}: must not depend on ${name} (found ${have})`);
      }
      continue;
    }
    if (have !== want) {
      failures.push(`${context}: ${name} expected ${want}, got ${have ?? "missing"}`);
    }
  }
}

/**
 * @param {string} folderName
 * @param {Record<string, string | undefined>} deps
 */
function assertLegacyExample(folderName, deps) {
  const optional = new Set(LEGACY_OPTIONAL[folderName] ?? []);
  for (const [name, want] of Object.entries(LEGACY_SDK_DEPS)) {
    const have = deps[name];
    if (name === "@osva-ai/sdk" || name === "@osva-ai/contracts") {
      if (have !== want) {
        failures.push(`${folderName}: ${name} must be ${want}, got ${have ?? "missing"}`);
      }
      continue;
    }
    if (optional.has(name)) {
      if (have !== want) {
        failures.push(`${folderName}: ${name} expected ${want}, got ${have ?? "missing"}`);
      }
    } else if (have !== undefined) {
      failures.push(`${folderName}: ${name} must be absent on legacy track (found ${have})`);
    }
  }
  if (deps["@osva-ai/connector-npm"] !== undefined) {
    failures.push(`${folderName}: legacy examples must not use @osva-ai/connector-npm`);
  }
  if (deps["@osva-ai/connector-github"] !== undefined) {
    failures.push(`${folderName}: legacy examples must not use @osva-ai/connector-github`);
  }
}

const exampleDirs = (await readdir(EXAMPLES_DIR, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && /^\d{2}-/.test(e.name))
  .map((e) => e.name)
  .sort();

if (exampleDirs.length !== 20) {
  failures.push(`expected 20 numbered example directories, found ${exampleDirs.length}`);
}

for (const folder of exampleDirs) {
  const pkgPath = path.join(EXAMPLES_DIR, folder, "package.json");
  const pkg = await readJson(pkgPath);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (folder === "19-research-report-agent") {
    assertDeps(folder, deps, EXAMPLE_19_DEPS);
    for (const name of Object.keys(deps)) {
      if (name.startsWith("@osva-ai/") && EXAMPLE_19_DEPS[name] === undefined) {
        failures.push(`${folder}: unexpected OSVA dependency ${name}@${deps[name]}`);
      }
    }
  } else if (folder === "20-github-repository-analyst") {
    assertDeps(folder, deps, EXAMPLE_20_DEPS);
    for (const name of Object.keys(deps)) {
      if (name.startsWith("@osva-ai/") && EXAMPLE_20_DEPS[name] === undefined) {
        failures.push(`${folder}: unexpected OSVA dependency ${name}@${deps[name]}`);
      }
    }
  } else {
    assertLegacyExample(folder, deps);
  }
}

const utils = await readJson(UTILS_PKG);
if (utils.dependencies?.["@osva-ai/contracts"] !== "1.0.0") {
  failures.push(
    `@osva-examples/utils must pin @osva-ai/contracts@1.0.0 for legacy track (got ${utils.dependencies?.["@osva-ai/contracts"]})`,
  );
}

const constantsSrc = await readFile(M19_CONSTANTS, "utf8");
for (const [pkg, version] of Object.entries(EXAMPLE_19_DEPS)) {
  if (!constantsSrc.includes(`"${pkg}": "${version}"`)) {
    failures.push(`M19.2 constants.mjs missing pin ${pkg}@${version}`);
  }
}

const b62ConstantsSrc = await readFile(B6_2_CONSTANTS, "utf8");
for (const [pkg, version] of Object.entries(EXAMPLE_20_DEPS)) {
  if (!b62ConstantsSrc.includes(`"${pkg}": "${version}"`)) {
    failures.push(`B6.2 constants.mjs missing pin ${pkg}@${version}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`Compatibility matrix verification failed:\n${failures.map((f) => `- ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Compatibility matrix verification passed (${exampleDirs.length} examples, legacy 01–18 @ 1.0.0, examples 19–20 @ 1.1.4).\n`,
  );
}
