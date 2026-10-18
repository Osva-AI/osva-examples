export type GrowthObjective = "grow-revenue" | "improve-conversion" | "improve-retention" | "reduce-acquisition-cost";

export interface GrowthOpsWorkerInput {
  readonly businessId: string;
  readonly objective: GrowthObjective;
  readonly context?: string;
}

export interface GrowthOpsWorkerRequest extends GrowthOpsWorkerInput {
  readonly runId: string;
}

export type GrowthConstraint = "acquisition" | "conversion" | "retention" | "merchandising" | "content" | "unknown";

export interface EvidenceRecord {
  readonly id: string;
  readonly category: "commerce" | "funnel" | "campaign" | "customer" | "content" | "product";
  readonly source: string;
  readonly observation: string;
}

export interface CommerceMetrics {
  readonly orders: number;
  readonly revenue: number;
  readonly averageOrderValue: number;
  readonly refundRate: number;
}

export interface FunnelMetrics {
  readonly sessions: number;
  readonly productViews: number;
  readonly addToCart: number;
  readonly checkoutStarted: number;
  readonly purchases: number;
}

export interface CampaignMetrics {
  readonly spend: number;
  readonly clicks: number;
  readonly paidConversions: number;
  readonly paidRevenue: number;
}

export interface CustomerSignal {
  readonly id: string;
  readonly theme: string;
  readonly sentiment: "negative" | "neutral" | "positive";
  readonly excerpt: string;
  readonly volume: number;
}

export interface ContentSignal {
  readonly pageId: string;
  readonly path: string;
  readonly impressions: number;
  readonly ctr: number;
  readonly avgPosition: number;
}

export interface ProductContext {
  readonly sku: string;
  readonly name: string;
  readonly inventoryUnits: number;
  readonly marginPercent: number;
}

export interface GrowthSignalBundle {
  readonly businessId: string;
  readonly commerce: CommerceMetrics;
  readonly funnel: FunnelMetrics;
  readonly campaign: CampaignMetrics;
  readonly customerSignals: readonly CustomerSignal[];
  readonly contentSignals: readonly ContentSignal[];
  readonly products: readonly ProductContext[];
}

export interface GrowthDiagnosis {
  readonly constraint: GrowthConstraint;
  readonly rationale: string;
  readonly evidenceIds: readonly string[];
}

export interface CustomerInsightAnalysis {
  readonly topThemes: readonly string[];
  readonly checkoutFrictionScore: number;
  readonly supportingEvidenceIds: readonly string[];
  readonly summary: string;
}

export interface ResearchContext {
  readonly notes: readonly string[];
  readonly supportingEvidenceIds: readonly string[];
}

export interface GrowthOpportunity {
  readonly id: string;
  readonly constraint: GrowthConstraint;
  readonly problem: string;
  readonly hypothesis: string;
  readonly supportingEvidenceIds: readonly string[];
  readonly expectedMetric: string;
  readonly interventionRoute: InterventionRoute;
  readonly basePriority: number;
}

export type InterventionRoute =
  "content-action" | "campaign-action" | "conversion-action" | "retention-action" | "monitor-only";

export interface CriticIssue {
  readonly code: string;
  readonly severity: "high" | "medium" | "low";
  readonly message: string;
  readonly opportunityId?: string;
}

export interface CriticReview {
  readonly issues: readonly CriticIssue[];
  readonly adjustedOpportunities: readonly {
    readonly opportunityId: string;
    readonly adjustedPriority: number;
    readonly downgraded: boolean;
  }[];
}

export interface SelectedIntervention {
  readonly opportunityId: string;
  readonly interventionRoute: InterventionRoute;
  readonly rationale: string;
}

export interface PreparedAction {
  readonly actionType:
    | "campaign-adjustment"
    | "lifecycle-campaign"
    | "landing-experiment"
    | "content-optimization"
    | "retention-experiment"
    | "monitor-only";
  readonly actionId: string;
  readonly title: string;
  readonly detail: string;
  readonly monitoringMetric: string;
  readonly risk: "high" | "medium" | "low";
}

export interface ApprovalSummary {
  readonly constraint: GrowthConstraint;
  readonly evidenceHighlights: readonly string[];
  readonly selectedIntervention: string;
  readonly expectedMetric: string;
  readonly riskReview: string;
  readonly proposedAction: string;
}

export interface ApprovalDecisionRecord {
  readonly decision: "APPROVED" | "REJECTED";
  readonly comment?: string;
}

export interface ActionExecutionResult {
  readonly actionId: string;
  readonly status: "completed" | "already-completed" | "rejected";
  readonly details: string;
  readonly monitoringMetric: string;
}

export interface ExecutionVerification {
  readonly actionRecorded: boolean;
  readonly monitoringMetricAttached: boolean;
  readonly duplicatePrevented: boolean;
  readonly notes: readonly string[];
}
