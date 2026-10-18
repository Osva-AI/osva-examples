import { afterEach, describe, expect, it, vi } from "vitest";

import { applyApprovedAction, classifyIssue, getIssue, resetFixtureWrites } from "../src/connector.js";
import { executeGitHubAutomation, parseAutomationInput } from "../src/runtime.js";

afterEach(() => {
  resetFixtureWrites();
  vi.restoreAllMocks();
});

describe("github automation agent contracts", () => {
  it("reads fixture issues and classifies them", () => {
    const issue = getIssue("fixture", 42);
    const analysis = classifyIssue(issue);
    expect(analysis.category).toBe("integration");
    expect(analysis.proposed.type).toBe("add_label");
  });

  it("requires approval before fixture writes", () => {
    const pending = executeGitHubAutomation({ mode: "fixture", issueNumber: 42, approval: "pending" });
    expect(pending["stage"]).toBe("awaiting_approval");
    expect(() => applyApprovedAction("live", 42, { type: "add_label", label: "x" })).toThrow(/disabled/);
  });

  it("applies approved actions idempotently in fixture mode", () => {
    const action = { type: "add_label" as const, label: "area:integrations" };
    const first = applyApprovedAction("fixture", 42, action);
    const second = applyApprovedAction("fixture", 42, action);
    expect(first).toEqual(second);
  });

  it("blocks writes when approval is rejected", () => {
    const result = executeGitHubAutomation({ mode: "fixture", issueNumber: 42, approval: "reject" });
    expect(result["stage"]).toBe("rejected");
    expect((result["write"] as { applied: boolean }).applied).toBe(false);
  });

  it("does not log credentials in parsed automation input", () => {
    const write = vi.spyOn(console, "log").mockImplementation(() => undefined);
    parseAutomationInput({ mode: "fixture", issueNumber: 42, approval: "approve", token: "ghp_secret" });
    write.mockRestore();
    expect(JSON.stringify({ mode: "fixture" })).not.toContain("ghp_secret");
  });
});
