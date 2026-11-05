import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { CONSUMER_PACKAGE_VERSIONS } from "./constants.mjs";
import { EXAMPLE_19_ROOT, EXAMPLE_UTILS_SRC, REPO_ROOT } from "./paths.mjs";

const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "output", ".osva"]);

const UTILS_IMPORT = "@osva-examples/utils";
const UTILS_RELATIVE = "./_osva-example-utils/index.js";

/**
 * Materialize a standalone Example 19 project under `destRoot`.
 *
 * @param {string} destRoot
 */
export async function materializeExample19Consumer(destRoot) {
  await rm(destRoot, { recursive: true, force: true });
  await mkdir(destRoot, { recursive: true });

  await cp(path.join(REPO_ROOT, "tsconfig.base.json"), path.join(destRoot, "tsconfig.base.json"));
  await copyExampleTree(path.join(EXAMPLE_19_ROOT, "src"), path.join(destRoot, "src"));
  await copyExampleTree(path.join(EXAMPLE_19_ROOT, "test"), path.join(destRoot, "test"));
  await copyUtilsIntoConsumer(path.join(destRoot, "src", "_osva-example-utils"));
  await rewriteUtilsImports(path.join(destRoot, "src"));
  await rewriteUtilsImports(path.join(destRoot, "test"));

  await writeFile(
    path.join(destRoot, "tsconfig.json"),
    `${JSON.stringify(buildConsumerTsconfig("tsconfig.json"), null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(destRoot, "tsconfig.build.json"),
    `${JSON.stringify(buildConsumerTsconfig("tsconfig.build.json"), null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(destRoot, "package.json"),
    `${JSON.stringify(buildConsumerPackageJson(), null, 2)}\n`,
    "utf8",
  );
}

/**
 * @param {string} srcDir
 * @param {string} destDir
 */
async function copyExampleTree(srcDir, destDir) {
  await mkdir(destDir, { recursive: true });
  for (const entry of await readdir(srcDir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const from = path.join(srcDir, entry.name);
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyExampleTree(from, to);
    } else if (entry.isFile()) {
      await cp(from, to);
    }
  }
}

/**
 * @param {string} utilsDest
 */
async function copyUtilsIntoConsumer(utilsDest) {
  await mkdir(utilsDest, { recursive: true });
  for (const entry of await readdir(EXAMPLE_UTILS_SRC, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    await cp(path.join(EXAMPLE_UTILS_SRC, entry.name), path.join(utilsDest, entry.name));
  }
}

/**
 * @param {string} rootDir
 */
async function rewriteUtilsImports(rootDir) {
  for (const entry of await readdir(rootDir, { withFileTypes: true })) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      await rewriteUtilsImports(full);
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    const original = await readFile(full, "utf8");
    if (!original.includes(UTILS_IMPORT)) continue;
    const updated = original.replaceAll(`from "${UTILS_IMPORT}"`, `from "${UTILS_RELATIVE}"`);
    await writeFile(full, updated, "utf8");
  }
}

function buildConsumerPackageJson() {
  return {
    name: "example-19-research-report-agent-external-consumer",
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: {
      build: "tsc -p tsconfig.build.json",
      typecheck: "tsc -p tsconfig.json --noEmit",
      test: "vitest run test",
      start: "node dist/main.js",
    },
    dependencies: { ...CONSUMER_PACKAGE_VERSIONS },
    devDependencies: {
      "@types/node": "24.13.4",
      typescript: "6.0.3",
      vitest: "5.0.0",
    },
  };
}

/**
 * @param {"tsconfig.json" | "tsconfig.build.json"} kind
 */
function buildConsumerTsconfig(kind) {
  if (kind === "tsconfig.build.json") {
    return {
      extends: "./tsconfig.json",
      compilerOptions: {
        rootDir: "src",
        outDir: "dist",
        noEmit: false,
      },
      include: ["src/**/*.ts"],
      exclude: ["test/**/*.ts"],
    };
  }
  return {
    extends: "./tsconfig.base.json",
    compilerOptions: {
      rootDir: ".",
      outDir: "dist",
    },
    include: ["src/**/*.ts", "test/**/*.ts"],
  };
}
