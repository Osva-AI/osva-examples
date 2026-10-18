export type ResearchBranchId = "market" | "competitor" | "customer";

export interface BranchFinding {
  readonly id: string;
  readonly branch: ResearchBranchId;
  readonly claim: string;
  readonly sourceId: string;
  readonly sourceTitle: string;
}

export interface BranchResearchResult {
  readonly branch: ResearchBranchId;
  readonly focus: string;
  readonly findings: readonly BranchFinding[];
}

const BRANCH_FOCUS: Readonly<Record<ResearchBranchId, string>> = {
  market: "Market sizing and buyer demand signals",
  competitor: "Competitive positioning and differentiation",
  customer: "Customer pain points and adoption barriers",
};

export function collectBranchFindings(question: string, branch: ResearchBranchId): BranchResearchResult {
  const normalized = question.toLowerCase();
  const findings: BranchFinding[] = [];

  if (branch === "market") {
    findings.push(
      {
        id: "mkt-1",
        branch,
        claim: "Mid-market SaaS teams cite measurable productivity gains from AI copilots in support workflows.",
        sourceId: "fixture-market-digest",
        sourceTitle: "SaaS Market Digest (fixture)",
      },
      {
        id: "mkt-2",
        branch,
        claim: normalized.includes("risk")
          ? "Budget scrutiny increases when AI ROI is not tied to ticket deflection within two quarters."
          : "Expansion budgets remain cautious until AI pilots show repeatable workflow wins.",
        sourceId: "fixture-market-spend",
        sourceTitle: "IT Spend Tracker (fixture)",
      },
    );
  }

  if (branch === "competitor") {
    findings.push(
      {
        id: "cmp-1",
        branch,
        claim: "Incumbent suites bundle AI assistants into existing seats, compressing standalone pricing power.",
        sourceId: "fixture-competitor-map",
        sourceTitle: "Competitive Landscape Map (fixture)",
      },
      {
        id: "cmp-2",
        branch,
        claim: "Best-in-class vendors differentiate on workflow integrations rather than raw model quality alone.",
        sourceId: "fixture-competitor-brief",
        sourceTitle: "Analyst Brief (fixture)",
      },
    );
  }

  if (branch === "customer") {
    findings.push(
      {
        id: "cus-1",
        branch,
        claim: "Support leaders worry about inconsistent answers when agents lack governed knowledge retrieval.",
        sourceId: "fixture-customer-interviews",
        sourceTitle: "Customer Interview Notes (fixture)",
      },
      {
        id: "cus-2",
        branch,
        claim: "Teams accept AI triage when human approval gates remain visible in the workflow audit trail.",
        sourceId: "fixture-customer-trust",
        sourceTitle: "Trust & Safety Survey (fixture)",
      },
    );
  }

  return {
    branch,
    focus: BRANCH_FOCUS[branch],
    findings,
  };
}
