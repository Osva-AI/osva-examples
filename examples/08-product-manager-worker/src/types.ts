export interface ProductWorkerInput {
  readonly productId: string;
  readonly objective?: string;
  readonly context?: string;
}

export interface ProductWorkerRequest extends ProductWorkerInput {
  readonly briefId: string;
}

export interface CustomerFeedback {
  readonly id: string;
  readonly customerSegment: string;
  readonly text: string;
}

export interface SupportTicket {
  readonly id: string;
  readonly category: string;
  readonly text: string;
}

export interface OnboardingStepMetric {
  readonly step: string;
  readonly started: number;
  readonly completed: number;
}

export interface ProductMetrics {
  readonly signups: number;
  readonly onboardingCompleted: number;
  readonly activationRate: number;
  readonly weekOneRetention: number;
  readonly onboardingSteps: readonly OnboardingStepMetric[];
  readonly featureAdoption: readonly { readonly feature: string; readonly adopters: number }[];
}

export interface ProductContext {
  readonly targetSegment: string;
  readonly strategicObjective: string;
  readonly constraints: readonly string[];
  readonly outOfScope: readonly string[];
}

export interface ProductEvidenceBundle {
  readonly productId: string;
  readonly feedback: readonly CustomerFeedback[];
  readonly tickets: readonly SupportTicket[];
  readonly metrics: ProductMetrics;
  readonly context: ProductContext;
}

export interface ProblemCluster {
  readonly id: string;
  readonly theme: string;
  readonly problemStatement: string;
  readonly feedbackIds: readonly string[];
  readonly ticketIds: readonly string[];
  readonly supportingMetrics?: readonly string[];
}

export type EvidenceStrength = "high" | "medium" | "low";
export type BusinessAlignment = "high" | "medium" | "low";

export interface ProductOpportunity {
  readonly id: string;
  readonly problemClusterId: string;
  readonly userProblem: string;
  readonly targetUser: string;
  readonly desiredOutcome: string;
  readonly evidenceStrength: EvidenceStrength;
  readonly businessAlignment: BusinessAlignment;
}

export interface PrioritizedOpportunity extends ProductOpportunity {
  readonly priorityScore: number;
  readonly priorityRank: number;
  readonly rationale: string;
}

export interface OpportunityPrioritization {
  readonly method: string;
  readonly opportunities: readonly PrioritizedOpportunity[];
}

export interface ProductBrief {
  readonly title: string;
  readonly problem: string;
  readonly targetUser: string;
  readonly evidence: readonly string[];
  readonly goal: string;
  readonly nonGoals: readonly string[];
  readonly proposedApproach: readonly string[];
  readonly successMetrics: readonly string[];
  readonly risks: readonly string[];
  readonly openQuestions: readonly string[];
}

export type BriefReviewIssueType =
  "weak-evidence" | "unsupported-assumption" | "missing-metric" | "scope-risk" | "solution-bias" | "business-conflict";

export interface BriefReviewIssue {
  readonly type: BriefReviewIssueType;
  readonly description: string;
}

export interface BriefReview {
  readonly issues: readonly BriefReviewIssue[];
  readonly summary: string;
}

export interface ApprovalSummary {
  readonly chosenProblem: string;
  readonly evidenceHighlights: readonly string[];
  readonly prioritizationRationale: string;
  readonly proposedApproach: readonly string[];
  readonly successMetrics: readonly string[];
  readonly reviewerConcerns: readonly string[];
}
