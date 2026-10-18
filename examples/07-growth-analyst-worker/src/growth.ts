import type {
  ApprovalSummary,
  ExperimentPrioritization,
  FunnelAnalysis,
  GrowthDiagnosis,
  GrowthExperiment,
  GrowthFinding,
  GrowthMetricsBundle,
  GrowthObjective,
  GrowthOpportunity,
  GrowthSeverity,
  GrowthWorkerRequest,
  ImpactLevel,
  PrioritizedExperiment,
} from "./types.js";

const LEVEL_WEIGHT: Record<GrowthSeverity | ImpactLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const CONFIDENCE_WEIGHT: Record<"high" | "medium" | "low", number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const EFFORT_WEIGHT: Record<"high" | "medium" | "low", number> = {
  low: 3,
  medium: 2,
  high: 1,
};

export function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0 || numerator < 0) {
    return null;
  }
  return roundRate(numerator / denominator);
}

export function roundRate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function formatPercent(rate: number | null): string {
  if (rate === null) {
    return "n/a";
  }
  return `${(rate * 100).toFixed(1)}%`;
}

export function analyzeFunnel(metrics: GrowthMetricsBundle): FunnelAnalysis {
  const { funnel, revenue, campaign } = metrics;
  const rates = {
    sessionToProductViewRate: safeRate(funnel.productViews, funnel.sessions),
    productViewToCartRate: safeRate(funnel.addToCart, funnel.productViews),
    cartToCheckoutRate: safeRate(funnel.checkoutStarted, funnel.addToCart),
    checkoutToPurchaseRate: safeRate(funnel.purchases, funnel.checkoutStarted),
    sessionToPurchaseRate: safeRate(funnel.purchases, funnel.sessions),
    cac: safeRate(campaign.spend, campaign.paidConversions),
    roas: safeRate(campaign.paidRevenue, campaign.spend),
    refundRate: safeRate(revenue.refunds, revenue.revenue),
  };

  const parts: string[] = [];
  if (rates.sessionToPurchaseRate !== null) {
    parts.push(`Overall session→purchase conversion is ${formatPercent(rates.sessionToPurchaseRate)}.`);
  } else {
    parts.push("Purchase conversion could not be calculated from funnel counts.");
  }
  if (rates.productViewToCartRate !== null) {
    parts.push(`Product view→add-to-cart is ${formatPercent(rates.productViewToCartRate)}.`);
  }
  if (rates.checkoutToPurchaseRate !== null) {
    parts.push(`Checkout→purchase completion is ${formatPercent(rates.checkoutToPurchaseRate)}.`);
  }

  return {
    rates,
    summary: parts.join(" "),
  };
}

export function detectGrowthIssues(
  metrics: GrowthMetricsBundle,
  funnelAnalysis: FunnelAnalysis,
): readonly GrowthFinding[] {
  const findings: GrowthFinding[] = [];
  const { rates } = funnelAnalysis;
  const { traffic, retention, campaign } = metrics;

  if (rates.productViewToCartRate !== null && rates.productViewToCartRate < 0.2) {
    findings.push({
      id: "finding-weak-add-to-cart",
      area: "conversion",
      finding: "Product views convert weakly into add-to-cart events.",
      evidence: `Add-to-cart rate from product views is ${formatPercent(rates.productViewToCartRate)} (rule threshold: 20%).`,
      severity: "high",
    });
  }

  if (rates.checkoutToPurchaseRate !== null && rates.checkoutToPurchaseRate < 0.75) {
    findings.push({
      id: "finding-checkout-abandonment",
      area: "conversion",
      finding: "Checkout sessions abandon before purchase more often than the demo benchmark.",
      evidence: `Checkout completion rate is ${formatPercent(rates.checkoutToPurchaseRate)} (rule threshold: 75%).`,
      severity: "medium",
    });
  }

  if (rates.sessionToProductViewRate !== null && rates.sessionToProductViewRate < 0.35 && traffic.sessions >= 10_000) {
    findings.push({
      id: "finding-weak-activation",
      area: "activation",
      finding: "Traffic volume is healthy but too few sessions reach product detail pages.",
      evidence: `Session→product view rate is ${formatPercent(rates.sessionToProductViewRate)} with ${traffic.sessions.toLocaleString()} sessions (threshold: 35%).`,
      severity: "medium",
    });
  }

  if (retention.repeatPurchaseRate < 0.15) {
    findings.push({
      id: "finding-low-repeat",
      area: "retention",
      finding: "Repeat purchase rate is below the demo retention benchmark.",
      evidence: `Repeat purchase rate is ${formatPercent(retention.repeatPurchaseRate)} (threshold: 15%).`,
      severity: "medium",
    });
  }

  if (rates.cac !== null && rates.cac > 50) {
    findings.push({
      id: "finding-high-cac",
      area: "acquisition",
      finding: "Paid acquisition cost per conversion exceeds the demo efficiency target.",
      evidence: `CAC is $${rates.cac.toFixed(2)} from $${campaign.spend.toLocaleString()} spend and ${campaign.paidConversions} paid conversions (threshold: $50).`,
      severity: "medium",
    });
  }

  if (rates.roas !== null && rates.roas < 3) {
    findings.push({
      id: "finding-weak-roas",
      area: "acquisition",
      finding: "Paid campaign return on ad spend is below the demo target.",
      evidence: `ROAS is ${rates.roas.toFixed(2)} from $${campaign.paidRevenue.toLocaleString()} paid revenue (threshold: 3.0).`,
      severity: "medium",
    });
  }

  if (rates.refundRate !== null && rates.refundRate > 0.025) {
    findings.push({
      id: "finding-refund-rate",
      area: "revenue",
      finding: "Refund volume is elevated relative to gross revenue.",
      evidence: `Refund rate is ${formatPercent(rates.refundRate)} (threshold: 2.5%).`,
      severity: "low",
    });
  }

  const paidShare = traffic.channelBreakdown.find((entry) => entry.channel === "paid");
  if (paidShare !== undefined && traffic.sessions > 0) {
    const share = paidShare.sessions / traffic.sessions;
    if (share > 0.35) {
      findings.push({
        id: "finding-channel-concentration",
        area: "acquisition",
        finding: "Paid media represents a large share of sessions, increasing acquisition risk.",
        evidence: `Paid channel is ${formatPercent(share)} of sessions (threshold: 35%).`,
        severity: "low",
      });
    }
  }

  return findings.sort((left, right) => left.id.localeCompare(right.id));
}

export function generateOpportunities(findings: readonly GrowthFinding[]): readonly GrowthOpportunity[] {
  const opportunities: GrowthOpportunity[] = [];

  const byId = new Map(findings.map((finding) => [finding.id, finding]));

  if (byId.has("finding-weak-add-to-cart")) {
    opportunities.push({
      id: "opp-improve-pdp-cta",
      problem: "Shoppers view products but hesitate to add items to cart.",
      hypothesis: "Clearer value props and stronger primary CTAs on product pages will lift add-to-cart.",
      expectedOutcome: "Higher product view→add-to-cart rate without increasing traffic spend.",
      supportingFindingIds: ["finding-weak-add-to-cart"],
    });
  }

  if (byId.has("finding-checkout-abandonment")) {
    opportunities.push({
      id: "opp-simplify-checkout",
      problem: "Checkout abandonment suggests friction or surprise costs late in the funnel.",
      hypothesis: "Surfacing shipping costs earlier and reducing checkout fields will improve completion.",
      expectedOutcome: "Higher checkout→purchase completion rate.",
      supportingFindingIds: ["finding-checkout-abandonment"],
    });
  }

  if (byId.has("finding-low-repeat")) {
    opportunities.push({
      id: "opp-lifecycle-email",
      problem: "First-time buyers rarely return for a second purchase.",
      hypothesis: "A post-purchase lifecycle sequence with replenishment timing will increase repeat orders.",
      expectedOutcome: "Improved repeat purchase rate among new customers.",
      supportingFindingIds: ["finding-low-repeat"],
    });
  }

  if (byId.has("finding-high-cac") || byId.has("finding-weak-roas")) {
    const supporting = ["finding-high-cac", "finding-weak-roas"].filter((id) => byId.has(id));
    opportunities.push({
      id: "opp-paid-landing-test",
      problem: "Paid traffic is expensive relative to attributed revenue.",
      hypothesis: "Message-matched landing pages and tighter audience targeting will improve paid efficiency.",
      expectedOutcome: "Lower CAC and higher ROAS on paid campaigns.",
      supportingFindingIds: supporting,
    });
  }

  if (byId.has("finding-weak-activation")) {
    opportunities.push({
      id: "opp-homepage-merchandising",
      problem: "Many sessions never reach product pages.",
      hypothesis: "Homepage merchandising and category entry points will route more sessions to PDPs.",
      expectedOutcome: "Higher session→product view rate.",
      supportingFindingIds: ["finding-weak-activation"],
    });
  }

  return opportunities.sort((left, right) => left.id.localeCompare(right.id));
}

export function assertOpportunityTraceability(
  opportunities: readonly GrowthOpportunity[],
  findings: readonly GrowthFinding[],
): void {
  const findingIds = new Set(findings.map((finding) => finding.id));
  for (const opportunity of opportunities) {
    if (opportunity.supportingFindingIds.length === 0) {
      throw new Error(`Opportunity ${opportunity.id} has no supporting findings.`);
    }
    for (const findingId of opportunity.supportingFindingIds) {
      if (!findingIds.has(findingId)) {
        throw new Error(`Opportunity ${opportunity.id} references unknown finding ${findingId}.`);
      }
    }
  }
}

export function generateExperiments(opportunities: readonly GrowthOpportunity[]): readonly GrowthExperiment[] {
  const experiments: GrowthExperiment[] = [];
  const byId = new Map(opportunities.map((item) => [item.id, item]));

  if (byId.has("opp-improve-pdp-cta")) {
    experiments.push({
      id: "exp-pdp-cta-variant",
      title: "Product page CTA and social proof test",
      hypothesis: "Adding size guidance and review snippets above the fold increases add-to-cart.",
      targetMetric: "product_view_to_cart_rate",
      expectedDirection: "increase",
      supportingOpportunityIds: ["opp-improve-pdp-cta"],
      effort: "low",
      impact: "high",
      confidence: "medium",
    });
  }

  if (byId.has("opp-simplify-checkout")) {
    experiments.push({
      id: "exp-checkout-shipping-banner",
      title: "Early shipping cost transparency in checkout",
      hypothesis: "Showing shipping estimates on cart and step one reduces abandonment.",
      targetMetric: "checkout_to_purchase_rate",
      expectedDirection: "increase",
      supportingOpportunityIds: ["opp-simplify-checkout"],
      effort: "medium",
      impact: "high",
      confidence: "medium",
    });
  }

  if (byId.has("opp-lifecycle-email")) {
    experiments.push({
      id: "exp-post-purchase-drip",
      title: "First-time buyer lifecycle email sequence",
      hypothesis: "Timed care tips and reorder reminders increase second purchase within 90 days.",
      targetMetric: "repeat_purchase_rate",
      expectedDirection: "increase",
      supportingOpportunityIds: ["opp-lifecycle-email"],
      effort: "medium",
      impact: "medium",
      confidence: "medium",
    });
  }

  if (byId.has("opp-paid-landing-test")) {
    experiments.push({
      id: "exp-paid-landing-message",
      title: "Paid traffic landing page message match",
      hypothesis: "Aligning hero copy with ad creative improves paid conversion efficiency.",
      targetMetric: "paid_roas",
      expectedDirection: "increase",
      supportingOpportunityIds: ["opp-paid-landing-test"],
      effort: "medium",
      impact: "medium",
      confidence: "low",
    });
  }

  if (byId.has("opp-homepage-merchandising")) {
    experiments.push({
      id: "exp-homepage-category-tiles",
      title: "Homepage category tile merchandising",
      hypothesis: "Prominent category tiles increase sessions reaching product pages.",
      targetMetric: "session_to_product_view_rate",
      expectedDirection: "increase",
      supportingOpportunityIds: ["opp-homepage-merchandising"],
      effort: "low",
      impact: "medium",
      confidence: "medium",
    });
  }

  return experiments.sort((left, right) => left.id.localeCompare(right.id));
}

export function assertExperimentTraceability(
  experiments: readonly GrowthExperiment[],
  opportunities: readonly GrowthOpportunity[],
): void {
  const opportunityIds = new Set(opportunities.map((item) => item.id));
  for (const experiment of experiments) {
    if (experiment.supportingOpportunityIds.length === 0) {
      throw new Error(`Experiment ${experiment.id} has no supporting opportunities.`);
    }
    for (const opportunityId of experiment.supportingOpportunityIds) {
      if (!opportunityIds.has(opportunityId)) {
        throw new Error(`Experiment ${experiment.id} references unknown opportunity ${opportunityId}.`);
      }
    }
  }
}

export function experimentPriorityScore(experiment: GrowthExperiment): number {
  return (
    LEVEL_WEIGHT[experiment.impact] * 100 +
    CONFIDENCE_WEIGHT[experiment.confidence] * 10 +
    EFFORT_WEIGHT[experiment.effort]
  );
}

export function prioritizeExperiments(
  experiments: readonly GrowthExperiment[],
  objective: GrowthObjective | undefined,
): ExperimentPrioritization {
  const objectiveBoost = objectiveBoostForMetric(objective);
  const scored = experiments.map((experiment) => {
    const base = experimentPriorityScore(experiment);
    const boost = objectiveBoost(experiment.targetMetric);
    const priorityScore = base + boost;
    return {
      ...experiment,
      priorityScore,
      priorityRank: 0,
      rationale: buildPriorityRationale(experiment, boost),
    };
  });

  scored.sort((left, right) => {
    const delta = right.priorityScore - left.priorityScore;
    if (delta !== 0) return delta;
    return left.id.localeCompare(right.id);
  });

  const ranked: PrioritizedExperiment[] = scored.map((item, index) => ({
    ...item,
    priorityRank: index + 1,
  }));

  return {
    method:
      "ICE-style score: impact×100 + confidence×10 + inverse-effort weight (low=3, medium=2, high=1), " +
      "plus a small objective boost when the target metric matches the stated business objective.",
    experiments: ranked,
  };
}

function objectiveBoostForMetric(objective: GrowthObjective | undefined): (targetMetric: string) => number {
  if (objective === undefined || objective === "overall-growth") {
    return () => 0;
  }
  const mapping: Record<Exclude<GrowthObjective, "overall-growth">, readonly string[]> = {
    conversion: ["product_view_to_cart_rate", "checkout_to_purchase_rate", "session_to_purchase_rate"],
    retention: ["repeat_purchase_rate"],
    revenue: ["paid_roas", "session_to_purchase_rate"],
    activation: ["session_to_product_view_rate"],
  };
  const metrics = mapping[objective];
  return (targetMetric) => (metrics.includes(targetMetric) ? 15 : 0);
}

function buildPriorityRationale(experiment: GrowthExperiment, objectiveBoost: number): string {
  const parts = [`impact=${experiment.impact}`, `confidence=${experiment.confidence}`, `effort=${experiment.effort}`];
  if (objectiveBoost > 0) {
    parts.push("objective-aligned boost applied");
  }
  return parts.join("; ");
}

export function runDiagnosis(metrics: GrowthMetricsBundle, funnelAnalysis: FunnelAnalysis): GrowthDiagnosis {
  const findings = detectGrowthIssues(metrics, funnelAnalysis);
  const opportunities = generateOpportunities(findings);
  assertOpportunityTraceability(opportunities, findings);
  return { findings, opportunities };
}

export function buildApprovalSummary(input: {
  readonly request: GrowthWorkerRequest;
  readonly metrics: GrowthMetricsBundle;
  readonly funnelAnalysis: FunnelAnalysis;
  readonly diagnosis: GrowthDiagnosis;
  readonly prioritization: ExperimentPrioritization;
}): ApprovalSummary {
  const sortedFindings = [...input.diagnosis.findings].sort((left, right) => {
    const rank = (value: GrowthSeverity) => (value === "high" ? 3 : value === "medium" ? 2 : 1);
    const delta = rank(right.severity) - rank(left.severity);
    if (delta !== 0) return delta;
    return left.id.localeCompare(right.id);
  });

  const topOpportunity = input.diagnosis.opportunities[0];
  const topExperiments = input.prioritization.experiments
    .slice(0, 3)
    .map((item) => `${item.priorityRank}. ${item.title}`);

  const keyMetrics = [
    `Sessions: ${input.metrics.traffic.sessions.toLocaleString()}`,
    `Session→purchase: ${formatPercent(input.funnelAnalysis.rates.sessionToPurchaseRate)}`,
    `View→cart: ${formatPercent(input.funnelAnalysis.rates.productViewToCartRate)}`,
    `Checkout completion: ${formatPercent(input.funnelAnalysis.rates.checkoutToPurchaseRate)}`,
    `Repeat purchase: ${formatPercent(input.metrics.retention.repeatPurchaseRate)}`,
    `ROAS: ${input.funnelAnalysis.rates.roas === null ? "n/a" : input.funnelAnalysis.rates.roas.toFixed(2)}`,
  ];

  return {
    headlineIssues: sortedFindings.slice(0, 3).map((item) => item.finding),
    topOpportunity: topOpportunity?.problem ?? "No opportunities generated from findings.",
    topExperiments,
    keyMetrics,
  };
}
