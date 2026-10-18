import type { ApprovalSummary, AttentionItem, AttentionPrioritization, RecommendedAction } from "./types.js";

export function prepareRecommendedActions(prioritization: AttentionPrioritization): readonly RecommendedAction[] {
  const top = prioritization.items
    .filter((item) => item.priority === "critical" || item.priority === "high")
    .slice(0, 5);
  const actions: RecommendedAction[] = [];

  for (const item of top) {
    actions.push(...actionsForItem(item));
  }

  return actions.sort((left, right) => left.id.localeCompare(right.id));
}

function actionsForItem(item: AttentionItem): RecommendedAction[] {
  switch (item.id) {
    case "risk-churn":
      return [
        {
          id: "act-churn-review",
          relatedPriorityId: item.id,
          action: "Schedule founder-led review of churn cohort drivers and onboarding fixes.",
          ownerRole: "Chief of Staff",
          dueWindow: "this-week",
          requiresApproval: false,
        },
        {
          id: "act-churn-customer-calls",
          relatedPriorityId: item.id,
          action: "Book three exit-interview calls with recent churned logos.",
          ownerRole: "Customer Success Lead",
          dueWindow: "this-week",
          requiresApproval: false,
        },
      ];
    case "risk-enterprise-launch":
      return [
        {
          id: "act-escalate-sso",
          relatedPriorityId: item.id,
          action: "Escalate SSO vendor certification blocker with daily standup until cleared.",
          ownerRole: "VP Engineering",
          dueWindow: "today",
          requiresApproval: false,
        },
      ];
    case "risk-acme-deal":
      return [
        {
          id: "act-acme-founder-call",
          relatedPriorityId: item.id,
          action: "Founder call with Acme economic buyer to unblock stalled enterprise deal.",
          ownerRole: "CEO",
          dueWindow: "this-week",
          requiresApproval: true,
        },
      ];
    case "risk-burn-growth":
      return [
        {
          id: "act-burn-scenario",
          relatedPriorityId: item.id,
          action: "Finance to publish 13-week cash scenario with growth vs efficiency tradeoffs.",
          ownerRole: "Finance Lead",
          dueWindow: "this-week",
          requiresApproval: false,
        },
      ];
    case "opp-paid-scale":
      return [
        {
          id: "act-paid-budget",
          relatedPriorityId: item.id,
          action: "Approve modest paid spend cap increase for high-ROAS channel test.",
          ownerRole: "CEO",
          dueWindow: "this-month",
          requiresApproval: true,
        },
      ];
    case "decision-enterprise-focus":
      return [
        {
          id: "act-decision-forum",
          relatedPriorityId: item.id,
          action: "Hold 30-minute leadership forum to decide enterprise launch vs Acme close priority.",
          ownerRole: "Chief of Staff",
          dueWindow: "today",
          requiresApproval: false,
        },
      ];
    default:
      return [
        {
          id: `act-followup-${item.id}`,
          relatedPriorityId: item.id,
          action: `Assign owner to investigate: ${item.title}.`,
          ownerRole: "Chief of Staff",
          dueWindow: "this-week",
          requiresApproval: false,
        },
      ];
  }
}

export function buildApprovalSummary(input: {
  readonly prioritization: AttentionPrioritization;
  readonly actions: readonly RecommendedAction[];
}): ApprovalSummary {
  const risks = input.prioritization.items.filter((item) => item.type === "risk").slice(0, 3);
  const opportunities = input.prioritization.items.filter((item) => item.type === "opportunity").slice(0, 3);
  const decisions = input.prioritization.items.filter((item) => item.type === "decision" && item.priority !== "low");

  return {
    topRisks: risks.map((item) => `${item.priority.toUpperCase()}: ${item.title}`),
    topOpportunities: opportunities.map((item) => `${item.priority.toUpperCase()}: ${item.title}`),
    criticalDecisions: decisions.map((item) => item.title),
    recommendedActions: input.actions.slice(0, 6).map((action) => {
      const approval = action.requiresApproval ? " (requires approval)" : "";
      return `${action.ownerRole}: ${action.action}${approval}`;
    }),
  };
}
