import { DEFAULT_COMPANY_ID } from "./input.js";
import type {
  CompanyDataBundle,
  CompanyKpis,
  CustomerSignals,
  OperationalIssue,
  ProjectUpdate,
  SalesPipelineSnapshot,
} from "./types.js";

interface CompanyFixture {
  readonly kpis: CompanyKpis;
  readonly projects: readonly ProjectUpdate[];
  readonly sales: SalesPipelineSnapshot;
  readonly customer: CustomerSignals;
  readonly operations: readonly OperationalIssue[];
}

const ATLAS_RUNTIME: CompanyFixture = {
  kpis: {
    mrr: 1_200_000,
    mrrGrowthRate: 0.08,
    priorMrrGrowthRate: 0.12,
    trialConversionRate: 0.18,
    grossRetentionRate: 0.92,
    logoChurnRate: 0.042,
    priorLogoChurnRate: 0.035,
    monthlyBurn: 380_000,
    priorMonthlyBurn: 350_000,
    grossMarginRate: 0.72,
    paidChannelRoas: 4.2,
    paidSpendCap: 45_000,
  },
  projects: [
    {
      id: "proj-enterprise-launch",
      name: "Enterprise SSO launch",
      owner: "Product",
      dueDate: "2026-10-01",
      status: "overdue",
      businessImpact: "high",
      blockers: ["SSO vendor certification pending", "Security review queue"],
      confidence: "medium",
    },
    {
      id: "proj-onboarding-v2",
      name: "Self-serve onboarding v2",
      owner: "Growth",
      dueDate: "2026-11-15",
      status: "on-track",
      businessImpact: "high",
      blockers: [],
      confidence: "high",
    },
    {
      id: "proj-mobile-companion",
      name: "Mobile companion app",
      owner: "Engineering",
      dueDate: "2026-12-01",
      status: "ahead",
      businessImpact: "medium",
      blockers: [],
      confidence: "high",
    },
  ],
  sales: {
    totalPipelineValue: 2_400_000,
    winRate: 0.22,
    enterprisePipelineGrowth: 0.18,
    stalledDeals: [
      { id: "deal-acme", account: "Acme Logistics", value: 450_000, daysStalled: 34 },
      { id: "deal-nimbus", account: "Nimbus Health", value: 120_000, daysStalled: 21 },
    ],
  },
  customer: {
    supportTicketTrendPct: 0.15,
    nps: 38,
    priorNps: 44,
    topChurnReasons: ["Onboarding complexity", "Pricing packaging confusion"],
    notableRequests: [
      { id: "req-dark-mode", text: "Dark mode for dashboard", mentionCount: 14 },
      { id: "req-snacks", text: "Office snack preferences survey", mentionCount: 9 },
    ],
  },
  operations: [
    {
      id: "ops-outage-postmortem",
      area: "platform",
      severity: "high",
      description: "Partial API outage last Tuesday; postmortem action items still open.",
      status: "monitoring",
    },
    {
      id: "ops-fulfillment-delay",
      area: "services",
      severity: "low",
      description: "Swag fulfillment for event booth delayed by one week.",
      status: "open",
    },
    {
      id: "ops-hiring-eng",
      area: "people",
      severity: "medium",
      description: "Two senior backend roles open for 90+ days.",
      status: "open",
    },
    {
      id: "ops-vendor-billing",
      area: "finance",
      severity: "low",
      description: "Disputed invoice with analytics vendor under review.",
      status: "open",
    },
  ],
};

const FIXTURES: Record<string, CompanyFixture> = {
  "atlas-runtime": ATLAS_RUNTIME,
};

export function buildCompanyDataBundle(companyId: string): CompanyDataBundle {
  const fixture = FIXTURES[companyId];
  if (fixture === undefined) {
    throw new Error(`Company '${companyId}' was not found in founder's office demo fixtures.`);
  }
  return {
    companyId,
    kpis: { ...fixture.kpis },
    projects: fixture.projects.map((item) => ({ ...item, blockers: [...item.blockers] })),
    sales: {
      ...fixture.sales,
      stalledDeals: fixture.sales.stalledDeals.map((deal) => ({ ...deal })),
    },
    customer: {
      ...fixture.customer,
      topChurnReasons: [...fixture.customer.topChurnReasons],
      notableRequests: fixture.customer.notableRequests.map((item) => ({ ...item })),
    },
    operations: fixture.operations.map((item) => ({ ...item })),
  };
}

export function getFixtureKpis(companyId: string): CompanyKpis {
  return { ...buildCompanyDataBundle(companyId).kpis };
}

export function getFixtureProjects(companyId: string): ProjectUpdate[] {
  return buildCompanyDataBundle(companyId).projects.map((item) => ({
    ...item,
    blockers: [...item.blockers],
  }));
}

export function getFixtureSalesPipeline(companyId: string): SalesPipelineSnapshot {
  const sales = buildCompanyDataBundle(companyId).sales;
  return { ...sales, stalledDeals: sales.stalledDeals.map((deal) => ({ ...deal })) };
}

export function getFixtureCustomerSignals(companyId: string): CustomerSignals {
  const customer = buildCompanyDataBundle(companyId).customer;
  return {
    ...customer,
    topChurnReasons: [...customer.topChurnReasons],
    notableRequests: customer.notableRequests.map((item) => ({ ...item })),
  };
}

export function getFixtureOperationalIssues(companyId: string): OperationalIssue[] {
  return buildCompanyDataBundle(companyId).operations.map((item) => ({ ...item }));
}

export const DEMO_COMPANY_DATA = buildCompanyDataBundle(DEFAULT_COMPANY_ID);
