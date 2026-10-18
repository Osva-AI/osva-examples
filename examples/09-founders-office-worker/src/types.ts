export interface FoundersOfficeInput {
  readonly companyId: string;
  readonly objective?: string;
  readonly context?: string;
}

export interface FoundersOfficeRequest extends FoundersOfficeInput {
  readonly briefId: string;
}

export interface CompanyKpis {
  readonly mrr: number;
  readonly mrrGrowthRate: number;
  readonly priorMrrGrowthRate: number;
  readonly trialConversionRate: number;
  readonly grossRetentionRate: number;
  readonly logoChurnRate: number;
  readonly priorLogoChurnRate: number;
  readonly monthlyBurn: number;
  readonly priorMonthlyBurn: number;
  readonly grossMarginRate: number;
  readonly paidChannelRoas: number;
  readonly paidSpendCap: number;
}

export interface ProjectUpdate {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
  readonly dueDate: string;
  readonly status: "on-track" | "at-risk" | "overdue" | "ahead";
  readonly businessImpact: "high" | "medium" | "low";
  readonly blockers: readonly string[];
  readonly confidence: "high" | "medium" | "low";
}

export interface SalesPipelineSnapshot {
  readonly totalPipelineValue: number;
  readonly winRate: number;
  readonly enterprisePipelineGrowth: number;
  readonly stalledDeals: readonly {
    readonly id: string;
    readonly account: string;
    readonly value: number;
    readonly daysStalled: number;
  }[];
}

export interface CustomerSignals {
  readonly supportTicketTrendPct: number;
  readonly nps: number;
  readonly priorNps: number;
  readonly topChurnReasons: readonly string[];
  readonly notableRequests: readonly { readonly id: string; readonly text: string; readonly mentionCount: number }[];
}

export interface OperationalIssue {
  readonly id: string;
  readonly area: string;
  readonly severity: "critical" | "high" | "medium" | "low";
  readonly description: string;
  readonly status: "open" | "monitoring" | "resolved";
}

export interface CompanyDataBundle {
  readonly companyId: string;
  readonly kpis: CompanyKpis;
  readonly projects: readonly ProjectUpdate[];
  readonly sales: SalesPipelineSnapshot;
  readonly customer: CustomerSignals;
  readonly operations: readonly OperationalIssue[];
}

export type SignalCategory = "growth" | "revenue" | "customer" | "operations" | "product" | "people" | "finance";

export type Level = "high" | "medium" | "low";

export interface NormalizedSignal {
  readonly id: string;
  readonly category: SignalCategory;
  readonly title: string;
  readonly description: string;
  readonly evidence: readonly string[];
  readonly urgency: Level;
  readonly impact: Level;
  readonly sourceRef: string;
}

export type AttentionType = "risk" | "opportunity" | "decision";

export type AttentionPriority = "critical" | "high" | "medium" | "low";

export interface AttentionItem {
  readonly id: string;
  readonly type: AttentionType;
  readonly title: string;
  readonly rationale: string;
  readonly sourceSignalIds: readonly string[];
  readonly priority: AttentionPriority;
  readonly priorityScore: number;
}

export interface AttentionPrioritization {
  readonly method: string;
  readonly items: readonly AttentionItem[];
}

export interface RecommendedAction {
  readonly id: string;
  readonly relatedPriorityId: string;
  readonly action: string;
  readonly ownerRole: string;
  readonly dueWindow: "today" | "this-week" | "this-month";
  readonly requiresApproval: boolean;
}

export interface DetectionResult {
  readonly risks: readonly AttentionItem[];
  readonly opportunities: readonly AttentionItem[];
  readonly decisions: readonly AttentionItem[];
}

export interface ApprovalSummary {
  readonly topRisks: readonly string[];
  readonly topOpportunities: readonly string[];
  readonly criticalDecisions: readonly string[];
  readonly recommendedActions: readonly string[];
}
