export type GitHubMode = "fixture" | "live";

export interface GitHubIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
}

export interface ProposedGitHubAction {
  readonly type: "add_label" | "add_comment";
  readonly label?: string;
  readonly comment?: string;
}

export interface GitHubWriteResult {
  readonly applied: boolean;
  readonly action: ProposedGitHubAction;
  readonly mode: GitHubMode;
}

const FIXTURE_ISSUE: GitHubIssue = {
  number: 42,
  title: "Webhook retries fail silently after deploy",
  body: "Customers report missing notifications. Started after v1.0 rollout.",
  labels: ["bug"],
};

const fixtureWrites = new Map<string, GitHubWriteResult>();

export function getIssue(mode: GitHubMode, issueNumber: number): GitHubIssue {
  if (mode !== "fixture") {
    throw new Error("Live GitHub mode is not enabled in this example package.");
  }
  if (issueNumber !== FIXTURE_ISSUE.number) {
    throw new Error(`Fixture issue ${String(issueNumber)} was not found.`);
  }
  return FIXTURE_ISSUE;
}

export function classifyIssue(issue: GitHubIssue): {
  readonly category: string;
  readonly proposed: ProposedGitHubAction;
} {
  const category = issue.title.toLowerCase().includes("webhook") ? "integration" : "general";
  return {
    category,
    proposed: {
      type: "add_label",
      label: category === "integration" ? "area:integrations" : "triage",
    },
  };
}

export function applyApprovedAction(
  mode: GitHubMode,
  issueNumber: number,
  action: ProposedGitHubAction,
): GitHubWriteResult {
  if (mode !== "fixture") {
    throw new Error("Live GitHub writes are disabled by default.");
  }
  const key = `${String(issueNumber)}:${action.type}:${action.label ?? action.comment ?? ""}`;
  const existing = fixtureWrites.get(key);
  if (existing !== undefined) return existing;
  const result: GitHubWriteResult = { applied: true, action, mode };
  fixtureWrites.set(key, result);
  return result;
}

export function resetFixtureWrites(): void {
  fixtureWrites.clear();
}
