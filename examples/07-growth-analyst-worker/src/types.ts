export type GrowthObjective = "conversion" | "retention" | "revenue" | "activation" | "overall-growth";

export interface GrowthWorkerInput {
  readonly businessId: string;
  readonly objective?: GrowthObjective;
  readonly context?: string;
}

export interface GrowthWorkerRequest extends GrowthWorkerInput {
  readonly analysisId: string;
}

export interface ChannelBreakdownEntry {
  readonly channel: string;
  readonly sessions: number;
}

export interface TrafficMetrics {
  readonly sessions: number;
  readonly users: number;
  readonly channelBreakdown: readonly ChannelBreakdownEntry[];
}

export interface FunnelCounts {
  readonly sessions: number;
  readonly productViews: number;
  readonly addToCart: number;
  readonly checkoutStarted: number;
  readonly purchases: number;
}

export interface RevenueMetrics {
  readonly orders: number;
  readonly customers: number;
  readonly revenue: number;
  readonly refunds: number;
  readonly averageOrderValue: number;
}

export interface RetentionMetrics {
  readonly repeatCustomers: number;
  readonly repeatPurchaseRate: number;
}

export interface CampaignMetrics {
  readonly spend: number;
  readonly clicks: number;
  readonly paidConversions: number;
  readonly paidRevenue: number;
}

export interface GrowthMetricsBundle {
  readonly businessId: string;
  readonly traffic: TrafficMetrics;
  readonly funnel: FunnelCounts;
  readonly revenue: RevenueMetrics;
  readonly retention: RetentionMetrics;
  readonly campaign: CampaignMetrics;
}

export interface FunnelRates {
  readonly sessionToProductViewRate: number | null;
  readonly productViewToCartRate: number | null;
  readonly cartToCheckoutRate: number | null;
  readonly checkoutToPurchaseRate: number | null;
  readonly sessionToPurchaseRate: number | null;
  readonly cac: number | null;
  readonly roas: number | null;
  readonly refundRate: number | null;
}

export interface FunnelAnalysis {
  readonly rates: FunnelRates;
  readonly summary: string;
}

export type GrowthIssueArea = "acquisition" | "activation" | "conversion" | "retention" | "revenue";

export type GrowthSeverity = "high" | "medium" | "low";

export interface GrowthFinding {
  readonly id: string;
  readonly area: GrowthIssueArea;
  readonly finding: string;
  readonly evidence: string;
  readonly severity: GrowthSeverity;
}

export interface GrowthOpportunity {
  readonly id: string;
  readonly problem: string;
  readonly hypothesis: string;
  readonly expectedOutcome: string;
  readonly supportingFindingIds: readonly string[];
}

export type EffortLevel = "low" | "medium" | "high";
export type ImpactLevel = "low" | "medium" | "high";
export type ConfidenceLevel = "low" | "medium" | "high";

export interface GrowthExperiment {
  readonly id: string;
  readonly title: string;
  readonly hypothesis: string;
  readonly targetMetric: string;
  readonly expectedDirection: "increase" | "decrease";
  readonly supportingOpportunityIds: readonly string[];
  readonly effort: EffortLevel;
  readonly impact: ImpactLevel;
  readonly confidence: ConfidenceLevel;
}

export interface PrioritizedExperiment extends GrowthExperiment {
  readonly priorityScore: number;
  readonly priorityRank: number;
  readonly rationale: string;
}

export interface ExperimentPrioritization {
  readonly method: string;
  readonly experiments: readonly PrioritizedExperiment[];
}

export interface GrowthDiagnosis {
  readonly findings: readonly GrowthFinding[];
  readonly opportunities: readonly GrowthOpportunity[];
}

export interface ApprovalSummary {
  readonly headlineIssues: readonly string[];
  readonly topOpportunity: string;
  readonly topExperiments: readonly string[];
  readonly keyMetrics: readonly string[];
}
