import type { JsonObject, JsonValue } from "@osva-ai/contracts";
import { createRuntime } from "@osva-ai/sdk/runtime";
import { isJsonRecord } from "@osva-examples/utils";

import {
  applyApprovedAction,
  classifyIssue,
  getIssue,
  type GitHubMode,
  type ProposedGitHubAction,
} from "./connector.js";

export function parseAutomationInput(input: JsonValue): {
  readonly mode: GitHubMode;
  readonly issueNumber: number;
  readonly approval: "approve" | "reject" | "pending";
} {
  if (!isJsonRecord(input)) throw new Error("Run input must be an object.");
  const modeRaw = input["mode"];
  const mode = modeRaw === "live" ? "live" : "fixture";
  const issueNumber = input["issueNumber"];
  if (typeof issueNumber !== "number" || !Number.isInteger(issueNumber)) {
    throw new Error("issueNumber must be an integer.");
  }
  const approvalRaw = input["approval"];
  const approval =
    approvalRaw === "approve" || approvalRaw === "reject" || approvalRaw === "pending" ? approvalRaw : "pending";
  return { mode, issueNumber, approval };
}

export function executeGitHubAutomation(input: JsonValue): JsonObject {
  const parsed = parseAutomationInput(input);
  const issue = getIssue(parsed.mode, parsed.issueNumber);
  const analysis = classifyIssue(issue);
  if (parsed.approval === "pending") {
    return toJson({
      stage: "awaiting_approval",
      issue,
      analysis,
      proposed: analysis.proposed,
    });
  }
  if (parsed.approval === "reject") {
    return toJson({ stage: "rejected", issue, analysis, write: { applied: false } });
  }
  const write = applyApprovedAction(parsed.mode, parsed.issueNumber, analysis.proposed);
  return toJson({ stage: "completed", issue, analysis, write });
}

export const githubAutomationRuntime = createRuntime({
  execute: (input) => executeGitHubAutomation(input),
});

export function buildAgentManifest(runtimeUrl: string) {
  return {
    schemaVersion: "1" as const,
    key: "github-automation-agent",
    name: "GitHub Automation Agent",
    runtime: { type: "REMOTE_HTTP" as const, protocolVersion: "1" as const, endpoint: runtimeUrl, timeoutMs: 30_000 },
    input: { schema: { type: "object" } },
    output: { schema: { type: "object" } },
    execution: { timeoutMs: 30_000, maxAttempts: 1 },
    capabilities: { model: false, tools: [] as string[] },
  };
}

function toJson(value: {
  readonly stage: string;
  readonly issue: unknown;
  readonly analysis: unknown;
  readonly proposed?: ProposedGitHubAction;
  readonly write?: unknown;
}): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}
