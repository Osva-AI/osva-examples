import type {
  CampaignMetrics,
  CommerceMetrics,
  ContentSignal,
  CustomerSignal,
  FunnelMetrics,
  GrowthSignalBundle,
  ProductContext,
} from "./types.js";

interface BusinessFixture {
  readonly commerce: CommerceMetrics;
  readonly funnel: FunnelMetrics;
  readonly campaign: CampaignMetrics;
  readonly customerSignals: readonly CustomerSignal[];
  readonly contentSignals: readonly ContentSignal[];
  readonly products: readonly ProductContext[];
}

const NORTHPEAK: BusinessFixture = {
  commerce: {
    orders: 1_960,
    revenue: 294_000,
    averageOrderValue: 150,
    refundRate: 0.03,
  },
  funnel: {
    sessions: 50_000,
    productViews: 22_000,
    addToCart: 3_300,
    checkoutStarted: 2_100,
    purchases: 1_960,
  },
  campaign: {
    spend: 45_000,
    clicks: 12_000,
    paidConversions: 600,
    paidRevenue: 90_000,
  },
  customerSignals: [
    {
      id: "cs-shipping-001",
      theme: "shipping-cost-checkout",
      sentiment: "negative",
      excerpt: "Shipping added at checkout made the total jump — I abandoned the cart.",
      volume: 412,
    },
    {
      id: "cs-sizing-002",
      theme: "sizing-clarity",
      sentiment: "neutral",
      excerpt: "Need clearer sizing on PDP before adding to cart.",
      volume: 88,
    },
  ],
  contentSignals: [
    {
      pageId: "pdp-rain-jacket",
      path: "/products/all-weather-rain-jacket",
      impressions: 18_400,
      ctr: 0.018,
      avgPosition: 11.2,
    },
    {
      pageId: "blog-winter-layers",
      path: "/blog/winter-layering-guide",
      impressions: 9_600,
      ctr: 0.042,
      avgPosition: 6.4,
    },
  ],
  products: [
    {
      sku: "SKU-RAIN-001",
      name: "All-Weather Rain Jacket",
      inventoryUnits: 820,
      marginPercent: 0.42,
    },
    {
      sku: "SKU-BOOT-014",
      name: "Summit Hiking Boot",
      inventoryUnits: 210,
      marginPercent: 0.38,
    },
  ],
};

const FIXTURES: Record<string, BusinessFixture> = {
  "northpeak-outdoors": NORTHPEAK,
};

interface RecordedAction {
  readonly actionId: string;
  readonly businessId: string;
  readonly actionType: string;
  readonly monitoringMetric: string;
  readonly title: string;
}

const recordedActions = new Map<string, RecordedAction>();

export function resetGrowthOpsFixtures(): void {
  recordedActions.clear();
}

export function resolveBusinessFixture(businessId: string): BusinessFixture {
  const fixture = FIXTURES[businessId];
  if (fixture === undefined) {
    throw new Error(`Business '${businessId}' was not found in growth operations fixtures.`);
  }
  return fixture;
}

export function buildSignalBundle(businessId: string): GrowthSignalBundle {
  const fixture = resolveBusinessFixture(businessId);
  return {
    businessId,
    commerce: { ...fixture.commerce },
    funnel: { ...fixture.funnel },
    campaign: { ...fixture.campaign },
    customerSignals: fixture.customerSignals.map((item) => ({ ...item })),
    contentSignals: fixture.contentSignals.map((item) => ({ ...item })),
    products: fixture.products.map((item) => ({ ...item })),
  };
}

export function getFixtureCommerceMetrics(businessId: string): CommerceMetrics {
  return { ...resolveBusinessFixture(businessId).commerce };
}

export function getFixtureFunnelMetrics(businessId: string): FunnelMetrics {
  return { ...resolveBusinessFixture(businessId).funnel };
}

export function getFixtureCampaignMetrics(businessId: string): CampaignMetrics {
  return { ...resolveBusinessFixture(businessId).campaign };
}

export function getFixtureCustomerSignals(businessId: string): CustomerSignal[] {
  return resolveBusinessFixture(businessId).customerSignals.map((item) => ({ ...item }));
}

export function getFixtureContentSignals(businessId: string): ContentSignal[] {
  return resolveBusinessFixture(businessId).contentSignals.map((item) => ({ ...item }));
}

export function getFixtureProductContext(businessId: string): ProductContext[] {
  return resolveBusinessFixture(businessId).products.map((item) => ({ ...item }));
}

export function executeDemoAction(input: {
  readonly businessId: string;
  readonly actionId: string;
  readonly actionType: string;
  readonly title: string;
  readonly monitoringMetric: string;
}): { readonly status: "completed" | "already-completed" | "rejected"; readonly details: string } {
  const existing = recordedActions.get(input.actionId);
  if (existing !== undefined) {
    return { status: "already-completed", details: "Demo action already recorded for this actionId." };
  }
  if (input.actionType === "monitor-only") {
    recordedActions.set(input.actionId, {
      actionId: input.actionId,
      businessId: input.businessId,
      actionType: input.actionType,
      monitoringMetric: input.monitoringMetric,
      title: input.title,
    });
    return { status: "completed", details: "Monitor-only plan recorded — no external side effects." };
  }
  recordedActions.set(input.actionId, {
    actionId: input.actionId,
    businessId: input.businessId,
    actionType: input.actionType,
    monitoringMetric: input.monitoringMetric,
    title: input.title,
  });
  return {
    status: "completed",
    details: `Recorded demo ${input.actionType} request '${input.title}' for ${input.businessId}.`,
  };
}

export function getRecordedAction(actionId: string): RecordedAction | undefined {
  const record = recordedActions.get(actionId);
  return record === undefined ? undefined : { ...record };
}

export function isActionRecorded(actionId: string): boolean {
  return recordedActions.has(actionId);
}
