import { REPORT_SCHEMA_VERSION, MILESTONE, PLATFORM_VERSION } from "./constants.mjs";
import { redactReportValue } from "./redact.mjs";

/**
 * @typedef {"PASS" | "FAIL" | "NOT_RUN"} CheckStatus
 */

/** @type {readonly string[]} */
export const INSTALLATION_MANDATORY_CHECK_IDS = [
  "materialize_consumer",
  "no_workspace_imports",
  "npm_install",
  "package_versions",
  "consumer_build",
  "runtime_entrypoints",
  "deterministic_tests",
];

/** @type {readonly string[]} */
export const LIVE_EXECUTION_CHECK_IDS = [
  "live_prerequisites",
  "deployment_reachable",
  "model_profile_resolved",
  "connector_registered",
  "run_terminal_succeeded",
  "model_activity",
  "tool_activity",
  "artifact_download",
  "artifact_structure",
];

/** @type {readonly string[]} */
export const LIVE_MANDATORY_CHECK_IDS = [
  ...INSTALLATION_MANDATORY_CHECK_IDS,
  ...LIVE_EXECUTION_CHECK_IDS,
  "live_agent_execution",
];

/** @type {Record<string, string>} */
const CHECK_TITLES = {
  materialize_consumer: "Materialize standalone Example 19 consumer",
  no_workspace_imports: "Verify no workspace or monorepo runtime imports",
  npm_install: "Install consumer dependencies from npm registry",
  package_versions: "Installed npm package versions match M19.2 pins",
  consumer_build: "Build materialized consumer (tsc)",
  runtime_entrypoints: "Verify main/app dist outputs and connector package presence",
  deterministic_tests: "Run consumer vitest deterministic fixture checks",
  live_agent_execution: "Live agent execution against OSVA deployment",
  live_prerequisites: "Validate live deployment configuration",
  deployment_reachable: "OSVA deployment reachable (auth context)",
  model_profile_resolved: "Resolve model profile for agent manifest",
  connector_registered: "Register npm MCP connector and import tools",
  run_terminal_succeeded: "Run reaches terminal attempt state SUCCEEDED",
  model_activity: "Verify MODEL run-step activity",
  tool_activity: "Verify TOOL run-step activity (npm MCP)",
  artifact_download: "Download persisted Markdown artifact",
  artifact_structure: "Validate Markdown research report structure",
};

/**
 * @param {Array<{ id: string, status: CheckStatus }>} checks
 * @param {string} id
 * @returns {CheckStatus | undefined}
 */
function lastStatusForCheck(checks, id) {
  const matches = checks.filter((row) => row.id === id);
  if (matches.length === 0) {
    return undefined;
  }
  return matches[matches.length - 1].status;
}

/**
 * Derive rollup status for `live_agent_execution` from granular live checks.
 *
 * @param {Array<{ id: string, status: CheckStatus }>} checks
 * @returns {{ status: CheckStatus, detail?: string }}
 */
export function deriveLiveAgentExecutionOutcome(checks) {
  for (const id of LIVE_EXECUTION_CHECK_IDS) {
    const status = lastStatusForCheck(checks, id);
    if (status === "FAIL") {
      return {
        status: "FAIL",
        detail: `Live agent execution did not complete successfully (failed check: ${id}).`,
      };
    }
  }

  const allPass = LIVE_EXECUTION_CHECK_IDS.every((id) => lastStatusForCheck(checks, id) === "PASS");
  if (allPass) {
    return { status: "PASS" };
  }

  if (lastStatusForCheck(checks, "live_prerequisites") === "NOT_RUN") {
    return {
      status: "NOT_RUN",
      detail: "Live prerequisites not satisfied; live agent execution was not attempted.",
    };
  }

  return {
    status: "NOT_RUN",
    detail: "Required live execution checks did not complete before the harness stopped.",
  };
}

export class M19AcceptanceReport {
  /** @type {"PASS" | "FAIL" | "PENDING" | undefined} */
  #overallOverride;

  /** @param {"installation" | "live"} mode */
  constructor(mode) {
    this.mode = mode;
    this.startedAt = Date.now();
    /** @type {Array<{ id: string, title: string, status: CheckStatus, detail?: string, evidence?: Record<string, unknown> }>} */
    this.checks = [];
    /** @type {string[]} */
    this.errors = [];
    /** @type {string[]} */
    this.deferredChecks = [];
    this.runId = undefined;
    this.agentVersionId = undefined;
    /** @type {Record<string, unknown> | undefined} */
    this.artifact = undefined;
    /** @type {Record<string, string>} */
    this.packageVersions = {};
    this.#overallOverride = undefined;
  }

  /**
   * @param {string} id
   * @param {string} title
   * @param {CheckStatus} status
   * @param {{ detail?: string, evidence?: Record<string, unknown> }} [options]
   */
  record(id, title, status, options = {}) {
    this.checks.push({
      id,
      title,
      status,
      ...(options.detail ? { detail: redactSecretsInText(options.detail) } : {}),
      ...(options.evidence ? { evidence: redactReportValue(options.evidence) } : {}),
    });
  }

  /** @param {"PASS" | "FAIL" | "PENDING"} status */
  setOverall(status) {
    this.#overallOverride = status;
  }

  addError(message) {
    this.errors.push(redactSecretsInText(message));
  }

  defer(checkId) {
    this.deferredChecks.push(checkId);
  }

  /** @param {string} id */
  #hasCheck(id) {
    return this.checks.some((row) => row.id === id);
  }

  /** @param {string} id */
  #statusForCheck(id) {
    const matches = this.checks.filter((row) => row.id === id);
    if (matches.length === 0) {
      return undefined;
    }
    return matches[matches.length - 1].status;
  }

  /** Record NOT_RUN for mandatory checks the harness never reached. */
  finalizeMandatoryChecks() {
    const mandatory = this.mode === "live" ? LIVE_MANDATORY_CHECK_IDS : INSTALLATION_MANDATORY_CHECK_IDS;
    for (const id of mandatory) {
      if (this.#hasCheck(id)) {
        continue;
      }
      this.record(id, CHECK_TITLES[id] ?? id, "NOT_RUN", {
        detail: "Required check was not executed before the harness stopped.",
      });
    }
  }

  /**
   * @returns {"PASS" | "FAIL" | "PENDING"}
   */
  resolveStatus() {
    if (this.#overallOverride !== undefined) {
      return this.#overallOverride;
    }
    if (this.errors.length > 0) {
      return "FAIL";
    }
    if (this.checks.some((row) => row.status === "FAIL")) {
      return "FAIL";
    }

    const mandatory = this.mode === "live" ? LIVE_MANDATORY_CHECK_IDS : INSTALLATION_MANDATORY_CHECK_IDS;

    for (const id of mandatory) {
      const status = this.#statusForCheck(id);
      if (status === "PASS") {
        continue;
      }
      if (status === "FAIL") {
        return "FAIL";
      }
      if (this.mode === "live") {
        return "PENDING";
      }
      return "FAIL";
    }

    return "PASS";
  }

  /**
   * @param {"PASS" | "FAIL" | "PENDING"} status
   * @returns {number}
   */
  static exitCodeForStatus(status) {
    if (status === "PASS" || status === "PENDING") {
      return 0;
    }
    return 1;
  }

  toJSON() {
    const status = this.resolveStatus();
    return {
      schemaVersion: REPORT_SCHEMA_VERSION,
      milestone: MILESTONE,
      mode: this.mode,
      status,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - this.startedAt,
      platformVersion: PLATFORM_VERSION,
      packageVersions: redactReportValue(this.packageVersions),
      checks: this.checks,
      ...(this.runId ? { runId: this.runId } : {}),
      ...(this.agentVersionId ? { agentVersionId: this.agentVersionId } : {}),
      ...(this.artifact ? { artifact: redactReportValue(this.artifact) } : {}),
      errors: this.errors,
      deferredChecks: this.deferredChecks,
    };
  }
}

function redactSecretsInText(text) {
  return String(text)
    .replace(/osva_ak_[A-Za-z0-9._-]+/g, "osva_ak_[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]");
}
