import { describe, expect, it, vi } from "vitest";

import { runRepositoryAnalystAgent } from "../src/agent.js";
import { FIXTURE_REPO_NAME, FIXTURE_REPO_OWNER, FIXTURE_RUN_KEY } from "../src/bindings.js";
import { FIXTURE_REPOSITORY, FIXTURE_ISSUE_LIST } from "../src/fixtures.js";

describe("runRepositoryAnalystAgent", () => {
  it("returns deterministic fixture output without tool calls", async () => {
    const invoke = vi.fn();
    const output = await runRepositoryAnalystAgent({
      input: {
        owner: FIXTURE_REPO_OWNER,
        repo: FIXTURE_REPO_NAME,
        maxIssueSampleSize: 3,
        runKey: FIXTURE_RUN_KEY,
      },
      tools: { invoke },
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(output.owner).toBe(FIXTURE_REPO_OWNER);
    expect(output.issueSummary.sampledCount).toBe(3);
  });

  it("invokes repository.get and issue.list for live-shaped input", async () => {
    const invoke = vi.fn().mockResolvedValueOnce(FIXTURE_REPOSITORY).mockResolvedValueOnce(FIXTURE_ISSUE_LIST);

    const output = await runRepositoryAnalystAgent({
      input: {
        owner: "Osva-AI",
        repo: "osva",
        maxIssueSampleSize: 5,
        issueState: "open",
        runKey: "unit-test",
      },
      tools: { invoke },
    });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(output.repository.fullName).toBe(FIXTURE_REPOSITORY.fullName);
    expect(output.issueSummary.sampling.limitation.length).toBeGreaterThan(0);
  });

  it("propagates provider errors", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("RATE_LIMIT"));
    await expect(
      runRepositoryAnalystAgent({
        input: { owner: "a", repo: "b", maxIssueSampleSize: 1, runKey: "x" },
        tools: { invoke },
      }),
    ).rejects.toThrow("RATE_LIMIT");
  });
});
