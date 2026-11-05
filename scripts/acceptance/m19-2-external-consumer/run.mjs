#!/usr/bin/env node
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { CONSUMER_PACKAGE_VERSIONS, PLATFORM_VERSION } from "./lib/constants.mjs";
import { validateResearchReportMarkdown } from "./lib/artifact-validation.mjs";
import { materializeExample19Consumer } from "./lib/materialize-consumer.mjs";
import { readInstalledPackageVersions } from "./lib/package-versions.mjs";
import { DEFAULT_REPORT_DIR } from "./lib/paths.mjs";
import { deriveLiveAgentExecutionOutcome, M19AcceptanceReport } from "./lib/report.mjs";
import { runCommand } from "./lib/run-command.mjs";
import { verifyNoWorkspaceImports } from "./lib/verify-no-workspace.mjs";

function printHelp() {
  console.log(`Usage: node scripts/acceptance/m19-2-external-consumer/run.mjs [options]

Modes:
  --mode installation   npm-only consumer install + build + deterministic tests (default)
  --mode live           end-to-end run against a configured OSVA ${PLATFORM_VERSION} deployment

Options:
  --keep-temp           Do not delete the temporary consumer directory
  --report-dir <path>   Output directory for JSON evidence (default: artifacts/acceptance/m19-2)

Live mode environment (required for live checks):
  OSVA_BASE_URL
  OSVA_API_KEY
  OSVA_AGENT_RUNTIME_URL
  OSVA_MCP_CONNECTOR_URL   (unless OSVA_MCP_CONNECTOR_STDIO=true)
  OSVA_MODEL_PROFILE_VERSION_ID (recommended)

Optional:
  OSVA_M19_SKIP_NPM_INSTALL=1   Skip npm install (consumer dir must already exist; dev only)
  OSVA_M19_CONSUMER_DIR=<path>  Use fixed consumer directory instead of a temp dir
`);
}

/**
 * @param {import("./lib/report.mjs").M19AcceptanceReport} report
 * @param {string} reportPath
 */
async function writeReport(report, reportPath) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  const payload = report.toJSON();
  await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote acceptance report: ${reportPath}`);
  console.log(`Status: ${payload.status}`);
}

/**
 * @returns {"installation" | "live"}
 */
function parseMode(argv) {
  const modeIndex = argv.indexOf("--mode");
  if (modeIndex === -1) return "installation";
  const value = argv[modeIndex + 1];
  if (value !== "installation" && value !== "live") {
    throw new Error(`Unknown mode ${String(value)}. Use installation or live.`);
  }
  return value;
}

function parseReportDir(argv) {
  const index = argv.indexOf("--report-dir");
  if (index === -1) return DEFAULT_REPORT_DIR;
  const value = argv[index + 1];
  if (value === undefined || value.length === 0) {
    throw new Error("--report-dir requires a path");
  }
  return path.resolve(value);
}

function livePrerequisites(env) {
  const missing = [];
  if (!env.OSVA_BASE_URL?.trim()) missing.push("OSVA_BASE_URL");
  if (!env.OSVA_API_KEY?.trim()) missing.push("OSVA_API_KEY");
  const trusted = env.OSVA_TRUSTED_RUNTIME_ROOT?.trim();
  if (!trusted && !env.OSVA_AGENT_RUNTIME_URL?.trim()) missing.push("OSVA_AGENT_RUNTIME_URL");
  const stdio = env.OSVA_MCP_CONNECTOR_STDIO?.trim().toLowerCase() === "true";
  if (!trusted && !stdio && !env.OSVA_MCP_CONNECTOR_URL?.trim()) {
    missing.push("OSVA_MCP_CONNECTOR_URL");
  }
  return missing;
}

/**
 * @param {import("./lib/report.mjs").M19AcceptanceReport} report
 * @param {string} consumerRoot
 */
async function runInstallationChecks(report, consumerRoot) {
  report.record("materialize_consumer", "Materialize standalone Example 19 consumer", "PASS", {
    evidence: { consumerRoot },
  });

  const workspaceScan = await verifyNoWorkspaceImports(consumerRoot);
  report.record(
    "no_workspace_imports",
    "Verify no workspace or monorepo runtime imports",
    workspaceScan.ok ? "PASS" : "FAIL",
    workspaceScan.ok
      ? {}
      : { detail: workspaceScan.violations.join("; "), evidence: { violations: workspaceScan.violations } },
  );

  if (process.env.OSVA_M19_SKIP_NPM_INSTALL === "1") {
    report.record("npm_install", "Install consumer dependencies from npm registry", "NOT_RUN", {
      detail: "OSVA_M19_SKIP_NPM_INSTALL=1",
    });
  } else {
    const install = await runCommand("npm", ["install", "--no-fund", "--no-audit"], { cwd: consumerRoot });
    report.record(
      "npm_install",
      "Install consumer dependencies from npm registry",
      install.code === 0 ? "PASS" : "FAIL",
      install.code === 0 ? {} : { detail: install.stderr || install.stdout },
    );
  }

  const installed = await readInstalledPackageVersions(consumerRoot);
  report.packageVersions = installed;
  const versionMismatches = Object.entries(CONSUMER_PACKAGE_VERSIONS).filter(
    ([name, expected]) => installed[name] !== expected,
  );
  report.record(
    "package_versions",
    "Installed npm package versions match M19.2 pins",
    versionMismatches.length === 0 ? "PASS" : "FAIL",
    versionMismatches.length === 0
      ? { evidence: { installed } }
      : {
          detail: versionMismatches
            .map(([name, expected]) => `${name}: expected ${expected}, got ${installed[name]}`)
            .join("; "),
          evidence: { expected: CONSUMER_PACKAGE_VERSIONS, installed },
        },
  );

  const build = await runCommand("npm", ["run", "build"], { cwd: consumerRoot });
  report.record(
    "consumer_build",
    "Build materialized consumer (tsc)",
    build.code === 0 ? "PASS" : "FAIL",
    build.code === 0 ? {} : { detail: build.stderr || build.stdout },
  );

  let entrypointsOk = false;
  /** @type {string | undefined} */
  let entrypointDetail;
  try {
    await access(path.join(consumerRoot, "dist", "main.js"));
    await access(path.join(consumerRoot, "dist", "app.js"));
    const connectorEntry = path.join(consumerRoot, "node_modules", "@osva-ai", "connector-npm", "package.json");
    await access(connectorEntry);
    entrypointsOk = true;
  } catch (error) {
    entrypointDetail = error instanceof Error ? error.message : String(error);
  }
  report.record(
    "runtime_entrypoints",
    "Verify main/app dist outputs and connector package presence",
    entrypointsOk ? "PASS" : "FAIL",
    entrypointDetail ? { detail: entrypointDetail } : {},
  );

  const tests = await runCommand("npm", ["test"], { cwd: consumerRoot });
  report.record(
    "deterministic_tests",
    "Run consumer vitest deterministic fixture checks",
    tests.code === 0 ? "PASS" : "FAIL",
    tests.code === 0 ? {} : { detail: tests.stderr || tests.stdout },
  );
}

/**
 * @param {import("./lib/report.mjs").M19AcceptanceReport} report
 * @param {"installation" | "live"} mode
 */
function recordLiveAgentExecutionSummary(report, mode) {
  const title = "Live agent execution against OSVA deployment";
  if (mode === "installation") {
    report.record("live_agent_execution", title, "NOT_RUN", {
      detail: "Installation mode does not execute live runs.",
    });
    report.defer("live_agent_execution");
    return;
  }

  const outcome = deriveLiveAgentExecutionOutcome(report.checks);
  report.record("live_agent_execution", title, outcome.status, outcome.detail ? { detail: outcome.detail } : {});
  if (outcome.status !== "PASS") {
    report.defer("live_agent_execution");
  }
}

/**
 * @param {import("./lib/report.mjs").M19AcceptanceReport} report
 * @param {string} consumerRoot
 * @param {NodeJS.ProcessEnv} env
 */
async function runLiveChecks(report, consumerRoot, env) {
  const missing = livePrerequisites(env);
  if (missing.length > 0) {
    report.record("live_prerequisites", "Validate live deployment configuration", "NOT_RUN", {
      detail: `Missing: ${missing.join(", ")}`,
    });
    report.defer("live_prerequisites");
    for (const id of [
      "deployment_reachable",
      "model_profile_resolved",
      "connector_registered",
      "run_terminal_succeeded",
      "model_activity",
      "tool_activity",
      "artifact_download",
      "artifact_structure",
    ]) {
      report.record(id, id, "NOT_RUN", { detail: "Live prerequisites not satisfied" });
      report.defer(id);
    }
    report.setOverall("PENDING");
    return;
  }

  report.record("live_prerequisites", "Validate live deployment configuration", "PASS");

  const previousCwd = process.cwd();
  process.chdir(consumerRoot);
  try {
    const { OsvaClient } = await import("@osva-ai/sdk");
    const client = new OsvaClient({
      baseUrl: env.OSVA_BASE_URL.trim(),
      apiKey: env.OSVA_API_KEY.trim(),
    });
    try {
      await client.auth.getContext();
      report.record("deployment_reachable", "OSVA deployment reachable (auth context)", "PASS");
    } catch (error) {
      report.record("deployment_reachable", "OSVA deployment reachable (auth context)", "FAIL", {
        detail: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const { runResearchReportExample } = await import(pathToFileURL(path.join(consumerRoot, "dist", "app.js")).href);

    let result;
    try {
      result = await runResearchReportExample(env);
    } catch (error) {
      report.record("run_terminal_succeeded", "Run reaches terminal attempt state SUCCEEDED", "FAIL", {
        detail: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    report.runId = result.runId;
    report.agentVersionId = result.agentVersionId;
    report.record("model_profile_resolved", "Resolve model profile for agent manifest", "PASS", {
      evidence: { modelProfileVersionId: result.modelProfileVersionId },
    });
    report.record("connector_registered", "Register npm MCP connector and import tools", "PASS", {
      evidence: {
        connectorId: result.connectorId,
        connectorVersionId: result.connectorVersionId,
        toolVersionIds: result.toolVersionIds,
      },
    });

    const succeeded = result.attemptStatus === "SUCCEEDED";
    report.record(
      "run_terminal_succeeded",
      "Run reaches terminal attempt state SUCCEEDED",
      succeeded ? "PASS" : "FAIL",
      { evidence: { attemptStatus: result.attemptStatus, runId: result.runId } },
    );

    const modelCount = result.modelActivity.length;
    report.record("model_activity", "Verify MODEL run-step activity", modelCount > 0 ? "PASS" : "FAIL", {
      evidence: { modelStepCount: modelCount },
    });

    const toolCount = result.toolActivity.length;
    report.record("tool_activity", "Verify TOOL run-step activity (npm MCP)", toolCount > 0 ? "PASS" : "FAIL", {
      evidence: { toolStepCount: toolCount },
    });

    const packageName = env.OSVA_EXAMPLE_PACKAGE_NAME?.trim() || "lodash";
    if (result.artifactPath === undefined) {
      report.record("artifact_download", "Download persisted Markdown artifact", "FAIL", {
        detail: "No artifactPath returned; demo runs must persist artifacts",
      });
      report.record("artifact_structure", "Validate Markdown research report structure", "NOT_RUN");
      report.defer("artifact_structure");
      return;
    }

    const markdown = await readFile(result.artifactPath, "utf8");
    report.record("artifact_download", "Download persisted Markdown artifact", "PASS", {
      evidence: {
        artifactPath: path.basename(result.artifactPath),
        byteLength: Buffer.byteLength(markdown, "utf8"),
        artifactId: result.output?.report?.artifactId,
      },
    });

    const structure = validateResearchReportMarkdown(markdown, packageName);
    report.record(
      "artifact_structure",
      "Validate Markdown research report structure",
      structure.ok ? "PASS" : "FAIL",
      structure.ok ? {} : { detail: structure.problems.join("; ") },
    );

    report.artifact = {
      name: result.output?.report?.name,
      mediaType: "text/markdown",
      byteLength: Buffer.byteLength(markdown, "utf8"),
      structureChecks: structure.problems,
    };
  } finally {
    process.chdir(previousCwd);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const mode = parseMode(argv);
  const keepTemp = argv.includes("--keep-temp");
  const reportDir = parseReportDir(argv);
  const report = new M19AcceptanceReport(mode);
  report.packageVersions = { ...CONSUMER_PACKAGE_VERSIONS };

  /** @type {string | undefined} */
  let consumerRoot = process.env.OSVA_M19_CONSUMER_DIR?.trim();
  let ownedTempDir = false;

  try {
    if (consumerRoot === undefined || consumerRoot.length === 0) {
      consumerRoot = await mkdtemp(path.join(os.tmpdir(), "osva-ex19-consumer-"));
      ownedTempDir = true;
    } else {
      consumerRoot = path.resolve(consumerRoot);
    }

    await materializeExample19Consumer(consumerRoot);
    await runInstallationChecks(report, consumerRoot);

    if (mode === "live") {
      await runLiveChecks(report, consumerRoot, process.env);
    } else {
      for (const id of [
        "live_prerequisites",
        "deployment_reachable",
        "model_profile_resolved",
        "connector_registered",
        "run_terminal_succeeded",
        "model_activity",
        "tool_activity",
        "artifact_download",
        "artifact_structure",
      ]) {
        report.record(id, `Live gate: ${id}`, "NOT_RUN", { detail: "Run with --mode live" });
        report.defer(id);
      }
    }

    recordLiveAgentExecutionSummary(report, mode);
    report.finalizeMandatoryChecks();
    const reportPath = path.join(reportDir, `m19-2-${mode}-${Date.now()}.json`);
    await writeReport(report, reportPath);

    process.exitCode = M19AcceptanceReport.exitCodeForStatus(report.resolveStatus());
  } catch (error) {
    report.addError(error instanceof Error ? error.message : String(error));
    report.finalizeMandatoryChecks();
    const reportPath = path.join(reportDir, `m19-2-${mode}-error-${Date.now()}.json`);
    await writeReport(report, reportPath);
    process.exitCode = M19AcceptanceReport.exitCodeForStatus(report.resolveStatus());
  } finally {
    if (ownedTempDir && !keepTemp && consumerRoot !== undefined) {
      await rm(consumerRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
}

await main();
