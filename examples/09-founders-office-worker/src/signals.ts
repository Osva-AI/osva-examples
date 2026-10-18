import type { CompanyDataBundle, Level, NormalizedSignal } from "./types.js";

export function normalizeCompanySignals(data: CompanyDataBundle): readonly NormalizedSignal[] {
  const signals: NormalizedSignal[] = [];

  const { kpis } = data;
  signals.push({
    id: "sig-kpi-churn",
    category: "customer",
    title: "Logo churn rate elevated",
    description: `Logo churn is ${formatPct(kpis.logoChurnRate)} vs ${formatPct(kpis.priorLogoChurnRate)} prior period.`,
    evidence: [`kpis.logoChurnRate=${kpis.logoChurnRate}`, `kpis.priorLogoChurnRate=${kpis.priorLogoChurnRate}`],
    urgency: kpis.logoChurnRate > 0.04 ? "high" : "medium",
    impact: "high",
    sourceRef: "get_kpis",
  });

  signals.push({
    id: "sig-kpi-growth-slowdown",
    category: "growth",
    title: "MRR growth deceleration",
    description: `MRR growth is ${formatPct(kpis.mrrGrowthRate)}, down from ${formatPct(kpis.priorMrrGrowthRate)} — direction unclear without more cohort data.`,
    evidence: [`kpis.mrrGrowthRate=${kpis.mrrGrowthRate}`, `kpis.priorMrrGrowthRate=${kpis.priorMrrGrowthRate}`],
    urgency: "low",
    impact: "medium",
    sourceRef: "get_kpis",
  });

  signals.push({
    id: "sig-kpi-burn",
    category: "finance",
    title: "Monthly burn increased",
    description: `Burn is $${kpis.monthlyBurn.toLocaleString()} vs $${kpis.priorMonthlyBurn.toLocaleString()} prior month while growth slowed.`,
    evidence: [`kpis.monthlyBurn=${kpis.monthlyBurn}`, `kpis.priorMonthlyBurn=${kpis.priorMonthlyBurn}`],
    urgency: kpis.monthlyBurn > kpis.priorMonthlyBurn ? "medium" : "low",
    impact: "high",
    sourceRef: "get_kpis",
  });

  signals.push({
    id: "sig-kpi-paid-roas",
    category: "growth",
    title: "Paid channel efficiency strong under cap",
    description: `Paid ROAS is ${kpis.paidChannelRoas.toFixed(1)} against a spend cap of $${kpis.paidSpendCap.toLocaleString()}.`,
    evidence: [`kpis.paidChannelRoas=${kpis.paidChannelRoas}`, `kpis.paidSpendCap=${kpis.paidSpendCap}`],
    urgency: "medium",
    impact: "medium",
    sourceRef: "get_kpis",
  });

  for (const project of data.projects) {
    const urgency: Level =
      project.status === "overdue" && project.businessImpact === "high"
        ? "high"
        : project.status === "at-risk"
          ? "medium"
          : project.status === "ahead"
            ? "low"
            : "low";
    signals.push({
      id: `sig-project-${project.id}`,
      category: "product",
      title: `Project: ${project.name}`,
      description: `Status ${project.status}; owner ${project.owner}; due ${project.dueDate}. Blockers: ${project.blockers.length === 0 ? "none" : project.blockers.join("; ")}.`,
      evidence: [
        `project.${project.id}.status=${project.status}`,
        `project.${project.id}.impact=${project.businessImpact}`,
      ],
      urgency,
      impact: project.businessImpact,
      sourceRef: "get_projects",
    });
  }

  for (const deal of data.sales.stalledDeals) {
    signals.push({
      id: `sig-sales-${deal.id}`,
      category: "revenue",
      title: `Stalled deal: ${deal.account}`,
      description: `Deal value $${deal.value.toLocaleString()} stalled ${deal.daysStalled} days.`,
      evidence: [`sales.${deal.id}.value=${deal.value}`, `sales.${deal.id}.daysStalled=${deal.daysStalled}`],
      urgency: deal.value >= 400_000 ? "high" : "medium",
      impact: deal.value >= 400_000 ? "high" : "medium",
      sourceRef: "get_sales_pipeline",
    });
  }

  if (data.sales.enterprisePipelineGrowth >= 0.15) {
    signals.push({
      id: "sig-sales-enterprise-momentum",
      category: "revenue",
      title: "Enterprise pipeline accelerating",
      description: `Enterprise pipeline grew ${formatPct(data.sales.enterprisePipelineGrowth)} this quarter.`,
      evidence: [`sales.enterprisePipelineGrowth=${data.sales.enterprisePipelineGrowth}`],
      urgency: "medium",
      impact: "high",
      sourceRef: "get_sales_pipeline",
    });
  }

  signals.push({
    id: "sig-customer-support-trend",
    category: "customer",
    title: "Support volume trending up",
    description: `Support tickets increased ${formatPct(data.customer.supportTicketTrendPct)} period over period.`,
    evidence: [`customer.supportTicketTrendPct=${data.customer.supportTicketTrendPct}`],
    urgency: data.customer.supportTicketTrendPct > 0.1 ? "medium" : "low",
    impact: "medium",
    sourceRef: "get_customer_signals",
  });

  signals.push({
    id: "sig-customer-nps",
    category: "customer",
    title: "NPS declined",
    description: `NPS is ${data.customer.nps}, down from ${data.customer.priorNps}.`,
    evidence: [`customer.nps=${data.customer.nps}`, `customer.priorNps=${data.customer.priorNps}`],
    urgency: "medium",
    impact: "medium",
    sourceRef: "get_customer_signals",
  });

  for (const reason of data.customer.topChurnReasons) {
    signals.push({
      id: `sig-churn-reason-${slug(reason)}`,
      category: "customer",
      title: `Churn driver: ${reason}`,
      description: `Repeated in exit and downgrade interviews this period.`,
      evidence: [`customer.topChurnReasons includes '${reason}'`],
      urgency: "medium",
      impact: "high",
      sourceRef: "get_customer_signals",
    });
  }

  for (const request of data.customer.notableRequests) {
    signals.push({
      id: `sig-request-${request.id}`,
      category: "product",
      title: `Customer request: ${request.text}`,
      description: `${request.mentionCount} mentions in feedback — may be noisy relative to strategic objectives.`,
      evidence: [`customer.notableRequests.${request.id}.mentionCount=${request.mentionCount}`],
      urgency: "low",
      impact: "low",
      sourceRef: "get_customer_signals",
    });
  }

  for (const issue of data.operations) {
    signals.push({
      id: `sig-ops-${issue.id}`,
      category: issue.area === "people" ? "people" : issue.area === "finance" ? "finance" : "operations",
      title: `Operations: ${issue.area}`,
      description: `${issue.description} (severity ${issue.severity}, status ${issue.status}).`,
      evidence: [`operations.${issue.id}.severity=${issue.severity}`, `operations.${issue.id}.status=${issue.status}`],
      urgency: severityToUrgency(issue.severity),
      impact: severityToImpact(issue.severity),
      sourceRef: "get_operational_issues",
    });
  }

  return signals.sort((left, right) => left.id.localeCompare(right.id));
}

export function assertSignalTraceability(signals: readonly NormalizedSignal[]): void {
  for (const signal of signals) {
    if (signal.evidence.length === 0) {
      throw new Error(`Signal ${signal.id} is missing evidence.`);
    }
    if (signal.sourceRef.length === 0) {
      throw new Error(`Signal ${signal.id} is missing sourceRef.`);
    }
  }
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function severityToUrgency(severity: string): Level {
  if (severity === "critical" || severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

function severityToImpact(severity: string): Level {
  return severityToUrgency(severity);
}
