import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveLiveAgentExecutionOutcome,
  INSTALLATION_MANDATORY_CHECK_IDS,
  LIVE_EXECUTION_CHECK_IDS,
  LIVE_MANDATORY_CHECK_IDS,
  M19AcceptanceReport,
} from "../lib/report.mjs";

describe("M19 acceptance report aggregation", () => {
  it("installation mode stays PASS when only live checks are NOT_RUN", () => {
    const report = new M19AcceptanceReport("installation");
    for (const id of INSTALLATION_MANDATORY_CHECK_IDS) {
      report.record(id, id, "PASS");
    }
    report.record("live_agent_execution", "live", "NOT_RUN");
    assert.equal(report.resolveStatus(), "PASS");
    assert.equal(M19AcceptanceReport.exitCodeForStatus(report.resolveStatus()), 0);
  });

  it("fatal harness errors produce FAIL and exit code 1", () => {
    const report = new M19AcceptanceReport("installation");
    report.record("materialize_consumer", "materialize", "PASS");
    report.addError("spawn EINVAL");
    report.finalizeMandatoryChecks();
    assert.equal(report.resolveStatus(), "FAIL");
    assert.equal(M19AcceptanceReport.exitCodeForStatus(report.resolveStatus()), 1);
    const notRun = report.checks.filter((row) => row.status === "NOT_RUN").map((row) => row.id);
    assert.ok(notRun.includes("npm_install"));
  });

  it("live mode becomes PENDING when prerequisites are NOT_RUN", () => {
    const report = new M19AcceptanceReport("live");
    report.record("npm_install", "install", "PASS");
    report.record("live_prerequisites", "prereq", "NOT_RUN");
    report.setOverall("PENDING");
    assert.equal(report.resolveStatus(), "PENDING");
    assert.equal(M19AcceptanceReport.exitCodeForStatus(report.resolveStatus()), 0);
  });

  it("live mode cannot PASS when a mandatory live check is NOT_RUN", () => {
    const report = new M19AcceptanceReport("live");
    for (const id of INSTALLATION_MANDATORY_CHECK_IDS) {
      report.record(id, id, "PASS");
    }
    for (const id of LIVE_EXECUTION_CHECK_IDS) {
      report.record(id, id, id === "artifact_structure" ? "NOT_RUN" : "PASS");
    }
    const rollup = deriveLiveAgentExecutionOutcome(report.checks);
    assert.equal(rollup.status, "NOT_RUN");
    report.record("live_agent_execution", "live", rollup.status, rollup.detail ? { detail: rollup.detail } : {});
    assert.equal(report.resolveStatus(), "PENDING");
  });

  it("deriveLiveAgentExecutionOutcome is PASS when all live execution checks pass", () => {
    /** @type {Array<{ id: string, status: "PASS" }>} */
    const checks = LIVE_EXECUTION_CHECK_IDS.map((id) => ({ id, status: "PASS" }));
    const outcome = deriveLiveAgentExecutionOutcome(checks);
    assert.equal(outcome.status, "PASS");
  });

  it("live mode PASS requires live_agent_execution PASS when all mandatory checks pass", () => {
    const report = new M19AcceptanceReport("live");
    for (const id of LIVE_MANDATORY_CHECK_IDS) {
      if (id === "live_agent_execution") {
        continue;
      }
      report.record(id, id, "PASS");
    }
    const rollup = deriveLiveAgentExecutionOutcome(report.checks);
    report.record("live_agent_execution", "live", rollup.status);
    assert.equal(rollup.status, "PASS");
    assert.equal(report.resolveStatus(), "PASS");
  });

  it("redacts api keys in error messages", () => {
    const report = new M19AcceptanceReport("installation");
    report.addError("failed with osva_ak_secret.part");
    const json = report.toJSON();
    assert.match(String(json.errors[0]), /\[REDACTED\]/);
    assert.doesNotMatch(String(json.errors[0]), /osva_ak_secret/);
    assert.equal(json.status, "FAIL");
  });
});
