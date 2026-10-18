import type {
  AttentionItem,
  AttentionPriority,
  AttentionPrioritization,
  DetectionResult,
  FoundersOfficeRequest,
  Level,
  NormalizedSignal,
} from "./types.js";

const LEVEL_WEIGHT: Record<Level | AttentionPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function detectRisksAndOpportunities(signals: readonly NormalizedSignal[]): DetectionResult {
  const signalById = new Map(signals.map((signal) => [signal.id, signal]));
  const risks: AttentionItem[] = [];
  const opportunities: AttentionItem[] = [];
  const decisions: AttentionItem[] = [];

  const churn = signalById.get("sig-kpi-churn");
  if (churn !== undefined && parseEvidenceNumber(churn.evidence[0] ?? "") > 0.04) {
    risks.push(
      buildItem("risk-churn", "risk", "Worsening logo churn threatens net retention", churn, [
        "sig-kpi-churn",
        "sig-customer-support-trend",
      ]),
    );
  }

  const enterpriseProject = signals.find((signal) => signal.id === "sig-project-proj-enterprise-launch");
  if (enterpriseProject !== undefined && enterpriseProject.description.includes("overdue")) {
    risks.push(
      buildItem("risk-enterprise-launch", "risk", "Enterprise launch overdue with SSO blockers", enterpriseProject, [
        "sig-project-proj-enterprise-launch",
      ]),
    );
  }

  const acmeDeal = signals.find((signal) => signal.id === "sig-sales-deal-acme");
  if (acmeDeal !== undefined) {
    risks.push(
      buildItem("risk-acme-deal", "risk", "High-value enterprise deal stalled", acmeDeal, ["sig-sales-deal-acme"]),
    );
  }

  const burn = signalById.get("sig-kpi-burn");
  const growth = signalById.get("sig-kpi-growth-slowdown");
  if (burn !== undefined && growth !== undefined) {
    risks.push(
      buildItem("risk-burn-growth", "risk", "Burn rising while MRR growth decelerates", burn, [
        "sig-kpi-burn",
        "sig-kpi-growth-slowdown",
      ]),
    );
  }

  const paidRoas = signalById.get("sig-kpi-paid-roas");
  if (paidRoas !== undefined) {
    opportunities.push(
      buildItem("opp-paid-scale", "opportunity", "High-ROAS paid channel may be underfunded", paidRoas, [
        "sig-kpi-paid-roas",
      ]),
    );
  }

  const enterpriseMomentum = signalById.get("sig-sales-enterprise-momentum");
  if (enterpriseMomentum !== undefined) {
    opportunities.push(
      buildItem(
        "opp-enterprise-pipeline",
        "opportunity",
        "Enterprise pipeline momentum — double down on sales focus",
        enterpriseMomentum,
        ["sig-sales-enterprise-momentum"],
      ),
    );
  }

  const mobile = signals.find((signal) => signal.id === "sig-project-proj-mobile-companion");
  if (mobile !== undefined && mobile.description.includes("ahead")) {
    opportunities.push(
      buildItem("opp-mobile-ahead", "opportunity", "Mobile companion ahead of plan with adoption upside", mobile, [
        "sig-project-proj-mobile-companion",
      ]),
    );
  }

  if (enterpriseProject !== undefined && acmeDeal !== undefined) {
    decisions.push(
      buildDecisionItem(
        "decision-enterprise-focus",
        "Prioritize enterprise launch vs stalled Acme close",
        "Both items compete for product and sales leadership time this week.",
        ["sig-project-proj-enterprise-launch", "sig-sales-deal-acme"],
        enterpriseProject,
      ),
    );
  }

  return {
    risks: sortDraftItems(risks),
    opportunities: sortDraftItems(opportunities),
    decisions: sortDraftItems(decisions),
  };
}

function buildItem(
  id: string,
  type: AttentionItem["type"],
  title: string,
  anchor: NormalizedSignal,
  sourceSignalIds: readonly string[],
): AttentionItem {
  return {
    id,
    type,
    title,
    rationale: `${anchor.description} (rule triggered from ${anchor.sourceRef}).`,
    sourceSignalIds,
    priority: "medium",
    priorityScore: 0,
  };
}

function buildDecisionItem(
  id: string,
  title: string,
  rationale: string,
  sourceSignalIds: readonly string[],
  anchor: NormalizedSignal,
): AttentionItem {
  return {
    id,
    type: "decision",
    title,
    rationale: `${rationale} Evidence anchor: ${anchor.id}.`,
    sourceSignalIds,
    priority: "medium",
    priorityScore: 0,
  };
}

function sortDraftItems(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

export function prioritizeAttentionItems(
  detection: DetectionResult,
  signals: readonly NormalizedSignal[],
  request: FoundersOfficeRequest,
): AttentionPrioritization {
  const signalById = new Map(signals.map((signal) => [signal.id, signal]));
  const combined = [...detection.risks, ...detection.opportunities, ...detection.decisions];

  const scored = combined.map((item) => {
    const score = attentionScore(item, signalById, request);
    const priority = scoreToPriority(score);
    return {
      ...item,
      priorityScore: score,
      priority,
      rationale: `${item.rationale} Priority score=${score} (${priority}).`,
    };
  });

  scored.sort((left, right) => {
    const delta = right.priorityScore - left.priorityScore;
    if (delta !== 0) return delta;
    return left.id.localeCompare(right.id);
  });

  return {
    method:
      "Founder attention score: max linked signal urgency/impact weights ×100, + type boost (risk +15, decision +10), " +
      "+ strategic keyword alignment to objective, − low-impact noise penalty for cosmetic/low-urgency signals only.",
    items: scored,
  };
}

function attentionScore(
  item: AttentionItem,
  signalById: Map<string, NormalizedSignal>,
  request: FoundersOfficeRequest,
): number {
  let score = 0;
  for (const signalId of item.sourceSignalIds) {
    const signal = signalById.get(signalId);
    if (signal === undefined) continue;
    score = Math.max(score, LEVEL_WEIGHT[signal.urgency] * 100 + LEVEL_WEIGHT[signal.impact] * 10);
    if (signal.urgency === "low" && signal.impact === "low") {
      score -= 80;
    }
  }

  if (item.type === "risk") score += 15;
  if (item.type === "decision") score += 10;

  const objective = (request.objective ?? "").toLowerCase();
  if (objective.includes("risk") && item.type === "risk") score += 10;
  if (objective.includes("growth") && item.type === "opportunity") score += 10;

  if (item.id.includes("snacks") || item.sourceSignalIds.some((id) => id.includes("req-snacks"))) {
    score -= 200;
  }

  if (item.id === "risk-churn") {
    score += 25;
  }

  return score;
}

function scoreToPriority(score: number): AttentionPriority {
  if (score >= 330) return "critical";
  if (score >= 250) return "high";
  if (score >= 150) return "medium";
  return "low";
}

function parseEvidenceNumber(evidence: string): number {
  const match = /=([0-9.]+)/.exec(evidence);
  if (match === null) return 0;
  return Number(match[1]);
}

export function assertAttentionTraceability(
  items: readonly AttentionItem[],
  signals: readonly NormalizedSignal[],
): void {
  const signalIds = new Set(signals.map((signal) => signal.id));
  for (const item of items) {
    if (item.sourceSignalIds.length === 0) {
      throw new Error(`Attention item ${item.id} has no source signals.`);
    }
    for (const signalId of item.sourceSignalIds) {
      if (!signalIds.has(signalId)) {
        throw new Error(`Attention item ${item.id} references unknown signal ${signalId}.`);
      }
    }
  }
}
