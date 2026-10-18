import type {
  ApprovalDecisionRecord,
  ApprovalSummary,
  CriticReview,
  CustomerInsightAnalysis,
  EvidenceRecord,
  ExecutionVerification,
  GrowthConstraint,
  GrowthDiagnosis,
  GrowthObjective,
  GrowthOpportunity,
  GrowthSignalBundle,
  InterventionRoute,
  PreparedAction,
  ResearchContext,
  SelectedIntervention,
} from "./types.js";
import { getRecordedAction, isActionRecorded } from "./fixtures.js";

export function buildEvidenceRecords(signals: GrowthSignalBundle): EvidenceRecord[] {
  const cartToCheckout = signals.funnel.addToCart === 0 ? 0 : signals.funnel.checkoutStarted / signals.funnel.addToCart;
  const viewToCart = signals.funnel.productViews === 0 ? 0 : signals.funnel.addToCart / signals.funnel.productViews;
  const paidCpa =
    signals.campaign.paidConversions === 0 ? 0 : signals.campaign.spend / signals.campaign.paidConversions;

  const records: EvidenceRecord[] = [
    {
      id: "ev-commerce-revenue",
      category: "commerce",
      source: "get_commerce_metrics",
      observation: `Revenue $${signals.commerce.revenue.toLocaleString()} across ${signals.commerce.orders} orders (AOV $${signals.commerce.averageOrderValue}).`,
    },
    {
      id: "ev-funnel-cart-checkout",
      category: "funnel",
      source: "get_funnel_metrics",
      observation: `Cart→checkout rate ${(cartToCheckout * 100).toFixed(1)}% (${signals.funnel.checkoutStarted}/${signals.funnel.addToCart} carts).`,
    },
    {
      id: "ev-funnel-view-cart",
      category: "funnel",
      source: "get_funnel_metrics",
      observation: `Product view→cart rate ${(viewToCart * 100).toFixed(1)}% (${signals.funnel.addToCart}/${signals.funnel.productViews} views).`,
    },
    {
      id: "ev-campaign-cpa",
      category: "campaign",
      source: "get_campaign_metrics",
      observation: `Paid CPA ~$${paidCpa.toFixed(0)} with $${signals.campaign.spend.toLocaleString()} spend and ${signals.campaign.paidConversions} paid conversions.`,
    },
  ];

  for (const signal of signals.customerSignals) {
    records.push({
      id: `ev-customer-${signal.id}`,
      category: "customer",
      source: "get_customer_signals",
      observation: `[${signal.sentiment}] ${signal.theme} (${signal.volume} mentions): ${signal.excerpt}`,
    });
  }

  for (const content of signals.contentSignals) {
    records.push({
      id: `ev-content-${content.pageId}`,
      category: "content",
      source: "get_content_signals",
      observation: `${content.path} CTR ${(content.ctr * 100).toFixed(1)}%, position ${content.avgPosition}.`,
    });
  }

  for (const product of signals.products) {
    records.push({
      id: `ev-product-${product.sku}`,
      category: "product",
      source: "get_inventory_or_product_context",
      observation: `${product.name} inventory ${product.inventoryUnits} units, margin ${(product.marginPercent * 100).toFixed(0)}%.`,
    });
  }

  return records.sort((left, right) => left.id.localeCompare(right.id));
}

export function diagnoseGrowthConstraint(
  objective: GrowthObjective,
  signals: GrowthSignalBundle,
  evidence: readonly EvidenceRecord[],
): GrowthDiagnosis {
  const cartToCheckout = signals.funnel.addToCart === 0 ? 1 : signals.funnel.checkoutStarted / signals.funnel.addToCart;
  const viewToCart = signals.funnel.productViews === 0 ? 1 : signals.funnel.addToCart / signals.funnel.productViews;
  const paidCpa =
    signals.campaign.paidConversions === 0 ? 0 : signals.campaign.spend / signals.campaign.paidConversions;

  let constraint: GrowthConstraint = "unknown";
  let rationale = "Insufficient signal to classify constraint.";

  if (objective === "improve-conversion" || objective === "grow-revenue") {
    if (cartToCheckout < 0.72) {
      constraint = "conversion";
      rationale = `Cart→checkout ${(cartToCheckout * 100).toFixed(1)}% is below the conversion guardrail for ${objective}.`;
    } else if (viewToCart < 0.2) {
      constraint = "merchandising";
      rationale = `Product view→cart ${(viewToCart * 100).toFixed(1)}% limits downstream conversion.`;
    } else {
      constraint = "conversion";
      rationale = "Checkout completion remains the limiting step versus traffic quality.";
    }
  } else if (objective === "reduce-acquisition-cost") {
    constraint = "acquisition";
    rationale = `Paid CPA ~$${paidCpa.toFixed(0)} exceeds efficient acquisition targets for D2C margin structure.`;
  } else if (objective === "improve-retention") {
    constraint = "retention";
    rationale = "Retention objective selected — lifecycle and repeat purchase signals require intervention.";
  }

  const evidenceIds = evidence
    .filter((item) => {
      if (constraint === "conversion") {
        return item.id.startsWith("ev-funnel") || item.id.includes("shipping");
      }
      if (constraint === "acquisition") {
        return item.id.startsWith("ev-campaign");
      }
      return true;
    })
    .slice(0, 5)
    .map((item) => item.id);

  return { constraint, rationale, evidenceIds };
}

export function analyzeCustomerSignals(
  signals: GrowthSignalBundle,
  evidence: readonly EvidenceRecord[],
): CustomerInsightAnalysis {
  const shipping = signals.customerSignals.find((item) => item.theme === "shipping-cost-checkout");
  const checkoutFrictionScore = shipping === undefined ? 0.2 : Math.min(1, shipping.volume / 500);
  const topThemes = signals.customerSignals
    .slice()
    .sort((left, right) => right.volume - left.volume)
    .map((item) => item.theme);
  const supportingEvidenceIds = evidence.filter((item) => item.category === "customer").map((item) => item.id);
  return {
    topThemes,
    checkoutFrictionScore,
    supportingEvidenceIds,
    summary:
      shipping === undefined
        ? "No dominant checkout friction theme in fixture signals."
        : `Checkout shipping sticker shock (${shipping.volume} mentions) aligns with cart abandonment.`,
  };
}

export function buildResearchContext(
  diagnosis: GrowthDiagnosis,
  _evidence: readonly EvidenceRecord[],
): ResearchContext {
  const notes: string[] = [];
  if (diagnosis.constraint === "conversion") {
    notes.push("Competitor benchmark: free shipping threshold at $75 is common in outdoor D2C.");
    notes.push("Industry note: unexpected shipping fees at checkout drive 18–25% cart drop-off in surveys.");
  }
  if (diagnosis.constraint === "acquisition") {
    notes.push("Paid social CPMs rose seasonally; efficiency gains likely require creative or landing alignment.");
  }
  if (notes.length === 0) {
    notes.push("Fixture research corpus — replace with live web/warehouse research in production.");
  }
  return {
    notes,
    supportingEvidenceIds: diagnosis.evidenceIds.slice(0, 3),
  };
}

export function generateOpportunities(
  diagnosis: GrowthDiagnosis,
  evidence: readonly EvidenceRecord[],
): GrowthOpportunity[] {
  const opportunities: GrowthOpportunity[] = [
    {
      id: "opp-shipping-threshold-test",
      constraint: "conversion",
      problem: "Cart→checkout drop correlates with shipping fees surfaced late in checkout.",
      hypothesis: "Display free-shipping threshold earlier and A/B test checkout shipping copy.",
      supportingEvidenceIds: ["ev-funnel-cart-checkout", "ev-customer-cs-shipping-001"],
      expectedMetric: "checkout_started_rate",
      interventionRoute: "conversion-action",
      basePriority: 92,
    },
    {
      id: "opp-flash-discount-paid",
      constraint: "acquisition",
      problem: "Paid traffic under-converts versus spend — short-term discount may spike revenue.",
      hypothesis: "Launch 20% off flash sale to all paid visitors for 48 hours.",
      supportingEvidenceIds: ["ev-campaign-cpa", "ev-commerce-revenue"],
      expectedMetric: "paid_roas_7d",
      interventionRoute: "campaign-action",
      basePriority: 88,
    },
    {
      id: "opp-pdp-snippet-refresh",
      constraint: "content",
      problem: "Hero PDP ranks but CTR underperforms category benchmarks.",
      hypothesis: "Refresh title/meta and add structured FAQ to improve organic CTR.",
      supportingEvidenceIds: ["ev-content-pdp-rain-jacket"],
      expectedMetric: "organic_ctr",
      interventionRoute: "content-action",
      basePriority: 74,
    },
  ];

  return opportunities.filter((opp) =>
    opp.supportingEvidenceIds.every((id) => evidence.some((item) => item.id === id)),
  );
}

export function runCriticReview(
  opportunities: readonly GrowthOpportunity[],
  diagnosis: GrowthDiagnosis,
  objective: GrowthObjective,
): CriticReview {
  const issues: CriticReview["issues"][number][] = [];
  const adjusted = opportunities.map((opp) => {
    let adjustedPriority = opp.basePriority;
    let downgraded = false;

    if (opp.id === "opp-flash-discount-paid") {
      issues.push({
        code: "margin-risk",
        severity: "high",
        message: "Blanket 20% discount erodes margin on core SKUs without lifecycle targeting.",
        opportunityId: opp.id,
      });
      if (objective === "improve-conversion") {
        issues.push({
          code: "metric-mismatch",
          severity: "medium",
          message: "Flash sale optimizes paid ROAS, not checkout_started_rate for the stated objective.",
          opportunityId: opp.id,
        });
        adjustedPriority = 28;
        downgraded = true;
      }
      if (diagnosis.constraint === "conversion") {
        issues.push({
          code: "weak-evidence-link",
          severity: "medium",
          message: "Campaign spend efficiency does not explain cart→checkout friction.",
          opportunityId: opp.id,
        });
        adjustedPriority = Math.min(adjustedPriority, 32);
        downgraded = true;
      }
    }

    if (opp.supportingEvidenceIds.length < 2) {
      issues.push({
        code: "weak-evidence",
        severity: "low",
        message: `Opportunity ${opp.id} has fewer than two evidence references.`,
        opportunityId: opp.id,
      });
      adjustedPriority -= 5;
    }

    return { opportunityId: opp.id, adjustedPriority, downgraded };
  });

  return { issues, adjustedOpportunities: adjusted };
}

export function selectIntervention(
  opportunities: readonly GrowthOpportunity[],
  critic: CriticReview,
  objective: GrowthObjective,
): SelectedIntervention {
  const priorityById = new Map(critic.adjustedOpportunities.map((item) => [item.opportunityId, item.adjustedPriority]));
  const ranked = opportunities
    .slice()
    .sort((left, right) => (priorityById.get(right.id) ?? 0) - (priorityById.get(left.id) ?? 0));

  const preferred =
    ranked.find((opp) => {
      if (objective === "improve-conversion") {
        return opp.constraint === "conversion";
      }
      if (objective === "reduce-acquisition-cost") {
        return opp.constraint === "acquisition";
      }
      if (objective === "improve-retention") {
        return opp.constraint === "retention";
      }
      return true;
    }) ?? ranked[0];

  if (preferred === undefined) {
    return {
      opportunityId: "none",
      interventionRoute: "monitor-only",
      rationale: "No viable opportunity passed critic review — monitor only.",
    };
  }

  return {
    opportunityId: preferred.id,
    interventionRoute: preferred.interventionRoute,
    rationale: `Selected ${preferred.id} with adjusted priority ${priorityById.get(preferred.id) ?? preferred.basePriority}.`,
  };
}

export function prepareAction(
  request: { readonly businessId: string; readonly runId: string },
  opportunity: GrowthOpportunity,
  route: InterventionRoute,
): PreparedAction {
  const actionId = `${request.runId}-${route}`.slice(0, 128);
  if (route === "monitor-only") {
    return {
      actionType: "monitor-only",
      actionId,
      title: "Monitor funnel and customer signals",
      detail: "No demo side effect — attach monitoring only.",
      monitoringMetric: opportunity.expectedMetric,
      risk: "low",
    };
  }
  if (route === "conversion-action") {
    return {
      actionType: "landing-experiment",
      actionId,
      title: "Checkout shipping threshold experiment",
      detail: "Create landing/checkout experiment task for free-shipping threshold messaging.",
      monitoringMetric: "checkout_started_rate",
      risk: "medium",
    };
  }
  if (route === "campaign-action") {
    return {
      actionType: "campaign-adjustment",
      actionId,
      title: "Paid campaign adjustment request",
      detail: "Simulated campaign bid/budget adjustment ticket (no ad spend).",
      monitoringMetric: opportunity.expectedMetric,
      risk: "high",
    };
  }
  if (route === "content-action") {
    return {
      actionType: "content-optimization",
      actionId,
      title: "PDP SEO snippet optimization task",
      detail: "Simulated content optimization task for hero PDP.",
      monitoringMetric: opportunity.expectedMetric,
      risk: "low",
    };
  }
  return {
    actionType: "retention-experiment",
    actionId,
    title: "Lifecycle retention experiment",
    detail: "Simulated retention experiment setup.",
    monitoringMetric: "repeat_purchase_rate_90d",
    risk: "medium",
  };
}

export function buildApprovalSummary(input: {
  readonly diagnosis: GrowthDiagnosis;
  readonly evidence: readonly EvidenceRecord[];
  readonly opportunity: GrowthOpportunity;
  readonly critic: CriticReview;
  readonly prepared: PreparedAction;
}): ApprovalSummary {
  const highlights = input.evidence
    .filter((item) => input.opportunity.supportingEvidenceIds.includes(item.id))
    .map((item) => item.observation)
    .slice(0, 4);
  const riskReview =
    input.critic.issues.length === 0
      ? "Critic found no blocking issues."
      : input.critic.issues
          .slice(0, 4)
          .map((issue) => `[${issue.severity}] ${issue.message}`)
          .join(" ");
  return {
    constraint: input.diagnosis.constraint,
    evidenceHighlights: highlights,
    selectedIntervention: input.opportunity.hypothesis,
    expectedMetric: input.opportunity.expectedMetric,
    riskReview,
    proposedAction: `${input.prepared.actionType}: ${input.prepared.title}`,
  };
}

export function verifyExecution(actionId: string, monitoringMetric: string): ExecutionVerification {
  const record = getRecordedAction(actionId);
  const notes: string[] = [];
  if (record === undefined) {
    notes.push("No demo action record found after execution.");
    return {
      actionRecorded: false,
      monitoringMetricAttached: false,
      duplicatePrevented: false,
      notes,
    };
  }
  if (record.monitoringMetric !== monitoringMetric) {
    notes.push("Monitoring metric on record does not match prepared action.");
  }
  notes.push("Execution verified against in-memory demo action store — no uplift fabricated.");
  return {
    actionRecorded: isActionRecorded(actionId),
    monitoringMetricAttached: record.monitoringMetric === monitoringMetric,
    duplicatePrevented: true,
    notes,
  };
}

export function actionAllowedAfterApproval(decision?: ApprovalDecisionRecord): boolean {
  return decision?.decision !== "REJECTED";
}

export function findOpportunity(
  opportunities: readonly GrowthOpportunity[],
  opportunityId: string,
): GrowthOpportunity | undefined {
  return opportunities.find((item) => item.id === opportunityId);
}
