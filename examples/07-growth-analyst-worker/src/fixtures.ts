import type {
  CampaignMetrics,
  FunnelCounts,
  GrowthMetricsBundle,
  RetentionMetrics,
  RevenueMetrics,
  TrafficMetrics,
} from "./types.js";

interface BusinessFixture {
  readonly name: string;
  readonly traffic: TrafficMetrics;
  readonly funnel: FunnelCounts;
  readonly revenue: RevenueMetrics;
  readonly retention: RetentionMetrics;
  readonly campaign: CampaignMetrics;
}

/** Primary D2C demo: healthy traffic but weak product-view → add-to-cart step. */
const NORTHPEAK_OUTDOORS: BusinessFixture = {
  name: "NorthPeak Outdoors",
  traffic: {
    sessions: 50_000,
    users: 42_000,
    channelBreakdown: [
      { channel: "organic", sessions: 18_000 },
      { channel: "paid", sessions: 19_000 },
      { channel: "email", sessions: 8_000 },
      { channel: "direct", sessions: 5_000 },
    ],
  },
  funnel: {
    sessions: 50_000,
    productViews: 22_000,
    addToCart: 3_300,
    checkoutStarted: 2_800,
    purchases: 1_960,
  },
  revenue: {
    orders: 1_960,
    customers: 1_820,
    revenue: 294_000,
    refunds: 8_820,
    averageOrderValue: 150,
  },
  retention: {
    repeatCustomers: 218,
    repeatPurchaseRate: 0.12,
  },
  campaign: {
    spend: 45_000,
    clicks: 12_000,
    paidConversions: 600,
    paidRevenue: 90_000,
  },
};

/** Isolated funnel with zero product views — exercises divide-by-zero guards. */
const NORTHPEAK_ZERO_VIEWS: BusinessFixture = {
  ...NORTHPEAK_OUTDOORS,
  funnel: {
    sessions: 10_000,
    productViews: 0,
    addToCart: 0,
    checkoutStarted: 0,
    purchases: 0,
  },
  revenue: {
    orders: 0,
    customers: 0,
    revenue: 0,
    refunds: 0,
    averageOrderValue: 0,
  },
};

const FIXTURES: Record<string, BusinessFixture> = {
  "northpeak-outdoors": NORTHPEAK_OUTDOORS,
  "northpeak-zero-views": NORTHPEAK_ZERO_VIEWS,
};

export function listFixtureBusinessIds(): readonly string[] {
  return Object.keys(FIXTURES);
}

export function resolveBusinessFixture(businessId: string): BusinessFixture {
  const fixture = FIXTURES[businessId];
  if (fixture === undefined) {
    throw new Error(`Business '${businessId}' was not found in growth demo fixtures.`);
  }
  return fixture;
}

export function buildMetricsBundle(businessId: string): GrowthMetricsBundle {
  const fixture = resolveBusinessFixture(businessId);
  return {
    businessId,
    traffic: { ...fixture.traffic, channelBreakdown: fixture.traffic.channelBreakdown.map((entry) => ({ ...entry })) },
    funnel: { ...fixture.funnel },
    revenue: { ...fixture.revenue },
    retention: { ...fixture.retention },
    campaign: { ...fixture.campaign },
  };
}

export function getFixtureTraffic(businessId: string): TrafficMetrics {
  const { traffic } = resolveBusinessFixture(businessId);
  return { ...traffic, channelBreakdown: traffic.channelBreakdown.map((entry) => ({ ...entry })) };
}

export function getFixtureFunnel(businessId: string): FunnelCounts {
  return { ...resolveBusinessFixture(businessId).funnel };
}

export function getFixtureRevenue(businessId: string): RevenueMetrics {
  return { ...resolveBusinessFixture(businessId).revenue };
}

export function getFixtureRetention(businessId: string): RetentionMetrics {
  return { ...resolveBusinessFixture(businessId).retention };
}

export function getFixtureCampaign(businessId: string): CampaignMetrics {
  return { ...resolveBusinessFixture(businessId).campaign };
}

export const DEMO_METRICS = buildMetricsBundle("northpeak-outdoors");
