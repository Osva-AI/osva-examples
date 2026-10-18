import type {
  BusinessAlignment,
  EvidenceStrength,
  OpportunityPrioritization,
  ProblemCluster,
  ProductBrief,
  ProductEvidenceBundle,
  ProductOpportunity,
  ProductWorkerRequest,
} from "./types.js";

const STRENGTH_WEIGHT: Record<EvidenceStrength | BusinessAlignment, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

interface ThemeRule {
  readonly id: string;
  readonly theme: string;
  readonly problemStatement: string;
  readonly patterns: readonly RegExp[];
  readonly ticketCategories?: readonly string[];
  readonly metricKeys?: readonly string[];
}

const THEME_RULES: readonly ThemeRule[] = [
  {
    id: "cluster-onboarding",
    theme: "Onboarding confusion",
    problemStatement: "New users struggle to complete setup and reach first value during onboarding.",
    patterns: [/onboarding/i, /wizard/i, /setup/i, /checklist/i, /first-run/i, /workspace/i, /invite/i, /activated/i],
    ticketCategories: ["onboarding"],
    metricKeys: ["onboarding-completion", "invite-team-dropoff"],
  },
  {
    id: "cluster-navigation",
    theme: "Navigation difficulty",
    problemStatement: "Users cannot reliably find core areas after signup or UI changes.",
    patterns: [/find where/i, /where is/i, /projects list/i, /search the docs/i],
    ticketCategories: ["navigation"],
  },
  {
    id: "cluster-integrations",
    theme: "Integration setup friction",
    problemStatement: "Connecting integrations disrupts onboarding progress and creates uncertainty.",
    patterns: [/integration/i, /slack/i, /connect/i],
    ticketCategories: ["integrations"],
    metricKeys: ["integration-before-core-task"],
  },
  {
    id: "cluster-pricing",
    theme: "Pricing confusion",
    problemStatement: "Trial users misread packaging and enterprise-oriented pricing cues.",
    patterns: [/pricing/i, /enterprise/i, /sso/i, /plan/i, /billing/i],
    ticketCategories: ["billing"],
  },
  {
    id: "cluster-dark-mode",
    theme: "Dark mode request",
    problemStatement: "Power users request a dark theme for extended usage sessions.",
    patterns: [/dark mode/i, /dark theme/i],
    ticketCategories: ["feature-request"],
    metricKeys: ["dark-mode-adoption"],
  },
];

export function clusterProblems(evidence: ProductEvidenceBundle): readonly ProblemCluster[] {
  const assignments = new Map<string, { feedbackIds: string[]; ticketIds: string[] }>();
  for (const rule of THEME_RULES) {
    assignments.set(rule.id, { feedbackIds: [], ticketIds: [] });
  }

  for (const item of evidence.feedback) {
    const rule = matchThemeRule(item.text);
    if (rule === undefined) continue;
    assignments.get(rule.id)?.feedbackIds.push(item.id);
  }

  for (const ticket of evidence.tickets) {
    const byText = matchThemeRule(ticket.text);
    const byCategory = THEME_RULES.find((rule) => rule.ticketCategories?.includes(ticket.category));
    const rule = byText ?? byCategory;
    if (rule === undefined) continue;
    assignments.get(rule.id)?.ticketIds.push(ticket.id);
  }

  const clusters: ProblemCluster[] = [];
  for (const rule of THEME_RULES) {
    const assigned = assignments.get(rule.id);
    if (assigned === undefined) continue;
    if (assigned.feedbackIds.length === 0 && assigned.ticketIds.length === 0) continue;
    clusters.push({
      id: rule.id,
      theme: rule.theme,
      problemStatement: rule.problemStatement,
      feedbackIds: [...new Set(assigned.feedbackIds)].sort(),
      ticketIds: [...new Set(assigned.ticketIds)].sort(),
      ...(rule.metricKeys === undefined ? {} : { supportingMetrics: [...rule.metricKeys] }),
    });
  }

  return clusters.sort((left, right) => left.id.localeCompare(right.id));
}

function matchThemeRule(text: string): ThemeRule | undefined {
  for (const rule of THEME_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule;
    }
  }
  return undefined;
}

export function analyzeOpportunities(
  evidence: ProductEvidenceBundle,
  clusters: readonly ProblemCluster[],
): readonly ProductOpportunity[] {
  return clusters.map((cluster) => {
    const evidenceStrength = scoreEvidenceStrength(evidence, cluster);
    const businessAlignment = scoreBusinessAlignment(evidence, cluster);
    return {
      id: opportunityIdForCluster(cluster.id),
      problemClusterId: cluster.id,
      userProblem: cluster.problemStatement,
      targetUser: targetUserForCluster(cluster.id, evidence.context.targetSegment),
      desiredOutcome: desiredOutcomeForCluster(cluster.id),
      evidenceStrength,
      businessAlignment,
    };
  });
}

function opportunityIdForCluster(clusterId: string): string {
  return clusterId.replace(/^cluster-/, "opp-");
}

function targetUserForCluster(clusterId: string, defaultSegment: string): string {
  if (clusterId === "cluster-dark-mode") return "Power users on existing teams";
  if (clusterId === "cluster-pricing") return "Trial admins evaluating plans";
  return defaultSegment;
}

function desiredOutcomeForCluster(clusterId: string): string {
  switch (clusterId) {
    case "cluster-onboarding":
      return "More new users complete onboarding and create a first task within day one.";
    case "cluster-navigation":
      return "Users reach tasks and team settings without support assistance.";
    case "cluster-integrations":
      return "Optional integrations do not block core onboarding completion.";
    case "cluster-pricing":
      return "Trial users understand SMB packaging without enterprise distractions.";
    case "cluster-dark-mode":
      return "Optional dark theme for users who prefer it.";
    default:
      return "Measurable improvement for the affected user segment.";
  }
}

function scoreEvidenceStrength(evidence: ProductEvidenceBundle, cluster: ProblemCluster): EvidenceStrength {
  const qualCount = cluster.feedbackIds.length + cluster.ticketIds.length;
  const hasQuant = clusterHasQuantSupport(evidence, cluster);
  const diverseSources = cluster.feedbackIds.length > 0 && cluster.ticketIds.length > 0;

  if (qualCount >= 4 && hasQuant && diverseSources) return "high";
  if (qualCount >= 3 && (hasQuant || diverseSources)) return "high";
  if (qualCount >= 2) return "medium";
  return "low";
}

function clusterHasQuantSupport(evidence: ProductEvidenceBundle, cluster: ProblemCluster): boolean {
  if (cluster.id === "cluster-onboarding") {
    const invite = evidence.metrics.onboardingSteps.find((step) => step.step === "invite-team");
    if (invite === undefined || invite.started <= 0) return false;
    const completion = invite.completed / invite.started;
    return completion < 0.6;
  }
  if (cluster.id === "cluster-integrations") {
    return evidence.metrics.onboardingSteps.some(
      (step) => step.step === "connect-integration" && step.started > step.completed,
    );
  }
  if (cluster.id === "cluster-dark-mode") {
    const adoption = evidence.metrics.featureAdoption.find((item) => item.feature === "dark-mode");
    return adoption !== undefined && adoption.adopters < 200;
  }
  if (cluster.id === "cluster-pricing") {
    return evidence.metrics.activationRate < 0.45;
  }
  return evidence.metrics.activationRate < 0.5;
}

function scoreBusinessAlignment(evidence: ProductEvidenceBundle, cluster: ProblemCluster): BusinessAlignment {
  const objective = evidence.context.strategicObjective.toLowerCase();
  if (cluster.id === "cluster-dark-mode") {
    return "low";
  }
  if (cluster.id === "cluster-onboarding" || cluster.id === "cluster-navigation") {
    return objective.includes("activation") || objective.includes("retention") ? "high" : "medium";
  }
  if (cluster.id === "cluster-integrations") {
    return "medium";
  }
  if (cluster.id === "cluster-pricing") {
    return objective.includes("activation") ? "medium" : "low";
  }
  return "medium";
}

export function opportunityPriorityScore(opportunity: ProductOpportunity, cluster: ProblemCluster): number {
  const reach = Math.min(20, cluster.feedbackIds.length * 3 + cluster.ticketIds.length * 4);
  return (
    STRENGTH_WEIGHT[opportunity.evidenceStrength] * 100 + STRENGTH_WEIGHT[opportunity.businessAlignment] * 10 + reach
  );
}

export function prioritizeOpportunities(
  opportunities: readonly ProductOpportunity[],
  clusters: readonly ProblemCluster[],
): OpportunityPrioritization {
  const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));
  const scored = opportunities.map((opportunity) => {
    const cluster = clusterById.get(opportunity.problemClusterId);
    if (cluster === undefined) {
      throw new Error(`Missing cluster for opportunity ${opportunity.id}.`);
    }
    const priorityScore = opportunityPriorityScore(opportunity, cluster);
    return {
      ...opportunity,
      priorityScore,
      priorityRank: 0,
      rationale: buildPriorityRationale(opportunity, cluster, priorityScore),
    };
  });

  scored.sort((left, right) => {
    const delta = right.priorityScore - left.priorityScore;
    if (delta !== 0) return delta;
    return left.id.localeCompare(right.id);
  });

  return {
    method:
      "Rule-based score: evidenceStrength×100 + businessAlignment×10 + reach cap (feedback×3 + tickets×4, max 20). " +
      "Business alignment downranks cosmetic or out-of-strategy themes regardless of mention volume.",
    opportunities: scored.map((item, index) => ({ ...item, priorityRank: index + 1 })),
  };
}

function buildPriorityRationale(opportunity: ProductOpportunity, cluster: ProblemCluster, score: number): string {
  return (
    `score=${score}; evidence=${opportunity.evidenceStrength}; alignment=${opportunity.businessAlignment}; ` +
    `reach=${cluster.feedbackIds.length} feedback + ${cluster.ticketIds.length} tickets`
  );
}

export function draftProductBrief(input: {
  readonly request: ProductWorkerRequest;
  readonly evidence: ProductEvidenceBundle;
  readonly prioritization: OpportunityPrioritization;
  readonly clusters: readonly ProblemCluster[];
}): ProductBrief {
  const top = input.prioritization.opportunities[0];
  if (top === undefined) {
    throw new Error("Cannot draft a product brief without prioritized opportunities.");
  }
  const cluster = input.clusters.find((item) => item.id === top.problemClusterId);
  if (cluster === undefined) {
    throw new Error("Top opportunity is missing a problem cluster reference.");
  }

  const evidenceLines = [
    ...cluster.feedbackIds.map((id) => `Feedback ${id}`),
    ...cluster.ticketIds.map((id) => `Ticket ${id}`),
    `Activation rate ${(input.evidence.metrics.activationRate * 100).toFixed(1)}%`,
    `Onboarding completion ${input.evidence.metrics.onboardingCompleted.toLocaleString()} / ${input.evidence.metrics.signups.toLocaleString()} signups`,
  ];

  const proposedApproach =
    top.problemClusterId === "cluster-onboarding"
      ? [
          "Reorder onboarding to first task creation before optional integrations.",
          "Add a resumable checklist with explicit progress for skipped steps.",
          "Inline definitions for workspace vs project on the setup wizard.",
        ]
      : [
          "Address the highest-frequency pain points surfaced in support and feedback.",
          "Validate changes with funnel metrics tied to activation.",
        ];

  return {
    title: `Activation improvement: ${cluster.theme}`,
    problem: top.userProblem,
    targetUser: top.targetUser,
    evidence: evidenceLines,
    goal: input.request.objective ?? DEFAULT_OBJECTIVE,
    nonGoals: [...input.evidence.context.outOfScope, "Dark mode theming (separate demand signal)"],
    proposedApproach,
    successMetrics:
      top.problemClusterId === "cluster-onboarding"
        ? [
            "Increase onboarding completion rate by 5 percentage points",
            "Increase invite-team step completion above 60%",
            "Increase week-one retention",
          ]
        : ["Improve activation rate", "Reduce related support ticket volume"],
    risks: [
      "Changes may slow advanced users who prefer current setup order.",
      "Integration partners may expect earlier connection prompts.",
    ],
    openQuestions: [
      "Should invite-team remain required for single-seat trials?",
      "Which integration prompts are truly optional for activation?",
    ],
  };
}

const DEFAULT_OBJECTIVE = "Improve activation for new users";

export function assertClusterTraceability(clusters: readonly ProblemCluster[], evidence: ProductEvidenceBundle): void {
  const feedbackIds = new Set(evidence.feedback.map((item) => item.id));
  const ticketIds = new Set(evidence.tickets.map((item) => item.id));
  for (const cluster of clusters) {
    for (const id of cluster.feedbackIds) {
      if (!feedbackIds.has(id)) {
        throw new Error(`Cluster ${cluster.id} references unknown feedback ${id}.`);
      }
    }
    for (const id of cluster.ticketIds) {
      if (!ticketIds.has(id)) {
        throw new Error(`Cluster ${cluster.id} references unknown ticket ${id}.`);
      }
    }
  }
}
