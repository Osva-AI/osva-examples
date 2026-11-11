import type {
  NormalizedGa4PropertySnapshot,
  NormalizedGa4ReportSnapshot,
  NormalizedOrderSnapshot,
  NormalizedProductSnapshot,
  NormalizedShopSnapshot,
} from "./normalize.js";
import { sanitizeProviderText } from "./normalize.js";

export interface PeriodContext {
  readonly startDate: string;
  readonly endDate: string;
  readonly shopTimezone: string;
  readonly ga4Timezone: string;
  readonly reconciliationNote: string;
}

export interface CommerceObservedMetrics {
  readonly shopCurrency: string;
  readonly sampledOrderCount: number;
  readonly sampledProductCount: number;
  readonly observedSampleRevenueTotal: string;
  readonly observedSampleRevenueNote: string;
  readonly financialStatusCounts: Record<string, number>;
  readonly topSampleProductsByTitle: readonly string[];
  readonly orderSampling: SamplingMetadata;
  readonly productSampling: SamplingMetadata;
}

export interface AcquisitionObservedMetrics {
  readonly channelRowsReturned: number;
  readonly topChannelsBySessions: readonly { readonly channel: string; readonly sessions: string }[];
  readonly reportLimitation: string;
}

export interface EcommerceObservedMetrics {
  readonly overviewRowsReturned: number;
  readonly highlightedMetrics: Record<string, string>;
  readonly reportLimitation: string;
}

export interface ObservationFinding {
  readonly id: string;
  readonly summary: string;
  readonly evidenceIds: readonly string[];
}

export interface OpportunityFinding {
  readonly id: string;
  readonly summary: string;
  readonly evidenceIds: readonly string[];
}

export interface RiskFinding {
  readonly id: string;
  readonly severity: "info" | "warning";
  readonly summary: string;
  readonly evidenceIds: readonly string[];
}

export interface RecommendationFinding {
  readonly id: string;
  readonly action: string;
  readonly rationale: string;
  readonly evidenceIds: readonly string[];
}

export interface EvidenceItem {
  readonly id: string;
  readonly kind: "shopify" | "ga4";
  readonly detail: string;
}

export interface SamplingMetadata {
  readonly requestedSampleSize: number;
  readonly sampledCount: number;
  readonly pagesFetched: number;
  readonly hasMoreOnProvider: boolean;
  readonly limitation: string;
}

export interface CommerceGrowthBrief {
  readonly period: PeriodContext;
  readonly commerce: CommerceObservedMetrics;
  readonly acquisition: AcquisitionObservedMetrics;
  readonly ecommerce: EcommerceObservedMetrics;
  readonly observations: readonly ObservationFinding[];
  readonly opportunities: readonly OpportunityFinding[];
  readonly risks: readonly RiskFinding[];
  readonly recommendations: readonly RecommendationFinding[];
  readonly evidence: readonly EvidenceItem[];
  readonly limitations: readonly string[];
}

const MAX_OBSERVATIONS = 12;
const MAX_OPPORTUNITIES = 8;
const MAX_RISKS = 8;
const MAX_RECOMMENDATIONS = 10;
const MAX_EVIDENCE = 48;

export function buildSamplingMetadata(options: {
  readonly requestedSampleSize: number;
  readonly sampledCount: number;
  readonly pagesFetched: number;
  readonly hasMoreOnProvider: boolean;
}): SamplingMetadata {
  const limitation = options.hasMoreOnProvider
    ? `Sample capped at ${options.sampledCount} records across ${options.pagesFetched} page(s); more data may exist at the provider.`
    : options.sampledCount < options.requestedSampleSize
      ? `Provider returned ${options.sampledCount} records (requested up to ${options.requestedSampleSize}) in ${options.pagesFetched} page(s).`
      : `Sample includes ${options.sampledCount} records from ${options.pagesFetched} page(s); no further pages reported.`;

  return {
    requestedSampleSize: options.requestedSampleSize,
    sampledCount: options.sampledCount,
    pagesFetched: options.pagesFetched,
    hasMoreOnProvider: options.hasMoreOnProvider,
    limitation,
  };
}

export function buildCommerceGrowthBrief(options: {
  readonly startDate: string;
  readonly endDate: string;
  readonly shop: NormalizedShopSnapshot;
  readonly ga4Property: NormalizedGa4PropertySnapshot;
  readonly products: readonly NormalizedProductSnapshot[];
  readonly orders: readonly NormalizedOrderSnapshot[];
  readonly acquisition: NormalizedGa4ReportSnapshot;
  readonly ecommerce: NormalizedGa4ReportSnapshot;
  readonly orderSampling: SamplingMetadata;
  readonly productSampling: SamplingMetadata;
}): CommerceGrowthBrief {
  const evidence: EvidenceItem[] = [
    {
      id: "shopify:shop",
      kind: "shopify",
      detail: `Shop ${sanitizeProviderText(options.shop.name)} currency=${options.shop.currencyCode} timezone=${options.shop.ianaTimezone}`,
    },
    {
      id: "ga4:property",
      kind: "ga4",
      detail: `Property ${options.ga4Property.id} displayName="${options.ga4Property.displayName}" timezone=${options.ga4Property.timeZone} currency=${options.ga4Property.currencyCode}`,
    },
  ];

  const financialStatusCounts: Record<string, number> = {};
  let revenueSum = 0;

  for (const order of options.orders) {
    evidence.push({
      id: `shopify:order:${order.id}`,
      kind: "shopify",
      detail: `Order ${order.name} financial=${order.financialStatus} total=${order.totalAmount} ${order.currencyCode}`,
    });
    financialStatusCounts[order.financialStatus] = (financialStatusCounts[order.financialStatus] ?? 0) + 1;
    const parsed = Number.parseFloat(order.totalAmount);
    if (Number.isFinite(parsed)) {
      revenueSum += parsed;
    }
  }

  for (const product of options.products.slice(0, 10)) {
    evidence.push({
      id: `shopify:product:${product.id}`,
      kind: "shopify",
      detail: `Product "${product.title}" status=${product.status} inventory=${product.totalInventory ?? "n/a"}`,
    });
  }

  const topSampleProductsByTitle = [...options.products]
    .sort((left, right) => left.title.localeCompare(right.title))
    .slice(0, 5)
    .map((product) => product.title);

  const commerce: CommerceObservedMetrics = {
    shopCurrency: options.shop.currencyCode,
    sampledOrderCount: options.orders.length,
    sampledProductCount: options.products.length,
    observedSampleRevenueTotal: revenueSum.toFixed(2),
    observedSampleRevenueNote:
      options.orderSampling.hasMoreOnProvider || options.orders.length < options.orderSampling.requestedSampleSize
        ? "Total reflects only the bounded Shopify order sample — not store-wide sales."
        : "Total reflects the retrieved order page(s) only; verify full-store totals in Shopify Admin if needed.",
    financialStatusCounts,
    topSampleProductsByTitle,
    orderSampling: options.orderSampling,
    productSampling: options.productSampling,
  };

  const acquisition = summarizeAcquisition(options.acquisition, evidence);
  const ecommerce = summarizeEcommerce(options.ecommerce, evidence);

  const period: PeriodContext = {
    startDate: options.startDate,
    endDate: options.endDate,
    shopTimezone: options.shop.ianaTimezone,
    ga4Timezone: options.ga4Property.timeZone,
    reconciliationNote:
      "Shopify order timestamps use the shop timezone; GA4 reports use the property timezone. Do not equate Shopify sampled revenue with GA4 purchase revenue because attribution, tax, refunds, and tracking coverage differ.",
  };

  const limitations = collectLimitations(options, commerce, acquisition, ecommerce);

  const observations = collectObservations(commerce, acquisition, ecommerce, limitations).slice(0, MAX_OBSERVATIONS);
  const opportunities = collectOpportunities(commerce, acquisition, ecommerce).slice(0, MAX_OPPORTUNITIES);
  const risks = collectRisks(commerce, acquisition, ecommerce, options).slice(0, MAX_RISKS);
  const recommendations = collectRecommendations(observations, opportunities, risks).slice(0, MAX_RECOMMENDATIONS);

  return {
    period,
    commerce,
    acquisition,
    ecommerce,
    observations,
    opportunities,
    risks,
    recommendations,
    evidence: evidence.slice(0, MAX_EVIDENCE),
    limitations,
  };
}

function summarizeAcquisition(
  report: NormalizedGa4ReportSnapshot,
  evidence: EvidenceItem[],
): AcquisitionObservedMetrics {
  const sessionsIndex = report.metricHeaders.indexOf("sessions");
  const channelIndex = report.dimensionHeaders.indexOf("sessionDefaultChannelGroup");
  const rows: { channel: string; sessions: string }[] = [];

  for (const row of report.rows) {
    const channel = channelIndex >= 0 ? sanitizeProviderText(row.dimensions[channelIndex] ?? "unknown") : "unknown";
    const sessions = sessionsIndex >= 0 ? sanitizeProviderText(row.metrics[sessionsIndex] ?? "0") : "0";
    rows.push({ channel, sessions });
    evidence.push({
      id: `ga4:acquisition:${channel}`,
      kind: "ga4",
      detail: `Channel ${channel} sessions=${sessions}`,
    });
  }

  rows.sort((left, right) => Number.parseFloat(right.sessions) - Number.parseFloat(left.sessions));

  const limitation = report.hasMoreRows
    ? "Acquisition rows may be truncated by connector pagination limits."
    : report.rowCountIsLowerBound
      ? "Acquisition rowCount is a lower bound from the retrieved page."
      : "Acquisition report reflects GA4 sessionDefaultChannelGroup for the requested window.";

  return {
    channelRowsReturned: report.rowsReturned,
    topChannelsBySessions: rows.slice(0, 5),
    reportLimitation: limitation,
  };
}

function summarizeEcommerce(report: NormalizedGa4ReportSnapshot, evidence: EvidenceItem[]): EcommerceObservedMetrics {
  const highlighted: Record<string, string> = {};
  const firstRow = report.rows[0];
  if (firstRow !== undefined) {
    for (let index = 0; index < report.metricHeaders.length; index += 1) {
      const header = report.metricHeaders[index];
      if (header === undefined) continue;
      highlighted[header] = sanitizeProviderText(firstRow.metrics[index] ?? "0");
    }
    evidence.push({
      id: "ga4:ecommerce:overview",
      kind: "ga4",
      detail: `Ecommerce overview metrics=${JSON.stringify(highlighted)}`,
    });
  }

  const limitation =
    report.rows.length === 0
      ? "GA4 ecommerce overview returned zero rows for the requested window."
      : report.hasMoreRows
        ? "Ecommerce metrics may be truncated by connector pagination."
        : "Ecommerce metrics are property-level GA4 values — not reconciled to Shopify order totals.";

  return {
    overviewRowsReturned: report.rowsReturned,
    highlightedMetrics: highlighted,
    reportLimitation: limitation,
  };
}

function collectLimitations(
  options: {
    readonly shop: NormalizedShopSnapshot;
    readonly ga4Property: NormalizedGa4PropertySnapshot;
    readonly acquisition: NormalizedGa4ReportSnapshot;
    readonly ecommerce: NormalizedGa4ReportSnapshot;
  },
  commerce: CommerceObservedMetrics,
  acquisition: AcquisitionObservedMetrics,
  ecommerce: EcommerceObservedMetrics,
): string[] {
  const out: string[] = [
    commerce.orderSampling.limitation,
    commerce.productSampling.limitation,
    acquisition.reportLimitation,
    ecommerce.reportLimitation,
  ];

  if (options.shop.currencyCode !== options.ga4Property.currencyCode) {
    out.push(
      `Shopify currency (${options.shop.currencyCode}) differs from GA4 property currency (${options.ga4Property.currencyCode}); do not merge monetary values.`,
    );
  }
  if (options.shop.ianaTimezone !== options.ga4Property.timeZone) {
    out.push(
      `Shop timezone (${options.shop.ianaTimezone}) differs from GA4 property timezone (${options.ga4Property.timeZone}).`,
    );
  }

  return out;
}

function collectObservations(
  commerce: CommerceObservedMetrics,
  acquisition: AcquisitionObservedMetrics,
  ecommerce: EcommerceObservedMetrics,
  limitations: readonly string[],
): ObservationFinding[] {
  const out: ObservationFinding[] = [];

  out.push({
    id: "obs-order-sample",
    summary: `Observed ${commerce.sampledOrderCount} Shopify orders in the bounded sample with sample revenue total ${commerce.observedSampleRevenueTotal} ${commerce.shopCurrency}.`,
    evidenceIds: ["shopify:shop"],
  });

  if (acquisition.topChannelsBySessions.length > 0) {
    const top = acquisition.topChannelsBySessions[0];
    if (top !== undefined) {
      out.push({
        id: "obs-top-channel",
        summary: `Top acquisition channel in sample: ${top.channel} (${top.sessions} sessions).`,
        evidenceIds: [`ga4:acquisition:${top.channel}`],
      });
    }
  }

  if (Object.keys(ecommerce.highlightedMetrics).length > 0) {
    out.push({
      id: "obs-ga4-ecommerce",
      summary: "GA4 ecommerce overview metrics retrieved for the same calendar window.",
      evidenceIds: ["ga4:ecommerce:overview"],
    });
  }

  if (limitations.some((item) => item.includes("currency"))) {
    out.push({
      id: "obs-currency-mismatch",
      summary: "Shopify and GA4 monetary fields use different currencies in this run.",
      evidenceIds: ["shopify:shop", "ga4:property"],
    });
  }

  return out;
}

function collectOpportunities(
  commerce: CommerceObservedMetrics,
  acquisition: AcquisitionObservedMetrics,
  ecommerce: EcommerceObservedMetrics,
): OpportunityFinding[] {
  const out: OpportunityFinding[] = [];

  if (commerce.sampledOrderCount > 0) {
    const paidRatio = (commerce.financialStatusCounts["PAID"] ?? 0) / Math.max(commerce.sampledOrderCount, 1);
    if (paidRatio < 1) {
      out.push({
        id: "opp-financial-status",
        summary: "Some sampled orders are not fully paid — review checkout or payment recovery for unpaid statuses.",
        evidenceIds: ["shopify:shop"],
      });
    }
  }

  if (acquisition.topChannelsBySessions.length >= 2) {
    const second = acquisition.topChannelsBySessions[1];
    if (second !== undefined) {
      out.push({
        id: "opp-channel-depth",
        summary: `Secondary channel ${second.channel} shows meaningful sessions — consider tailored landing experiences.`,
        evidenceIds: [`ga4:acquisition:${second.channel}`],
      });
    }
  }

  if (ecommerce.overviewRowsReturned === 0) {
    out.push({
      id: "opp-tracking-coverage",
      summary:
        "GA4 ecommerce overview is empty — validate purchase event instrumentation before optimizing conversion.",
      evidenceIds: ["ga4:property"],
    });
  }

  return out;
}

function collectRisks(
  commerce: CommerceObservedMetrics,
  acquisition: AcquisitionObservedMetrics,
  ecommerce: EcommerceObservedMetrics,
  options: { readonly orders: readonly NormalizedOrderSnapshot[] },
): RiskFinding[] {
  const risks: RiskFinding[] = [];

  if (commerce.orderSampling.hasMoreOnProvider) {
    risks.push({
      id: "risk-order-pagination",
      severity: "warning",
      summary: "Additional Shopify orders exist beyond this sample; observed revenue is not a store total.",
      evidenceIds: ["shopify:shop"],
    });
  }

  if (acquisition.channelRowsReturned === 0) {
    risks.push({
      id: "risk-empty-acquisition",
      severity: "warning",
      summary: "GA4 acquisition report returned no rows — channel insights are unavailable for this window.",
      evidenceIds: ["ga4:property"],
    });
  }

  if (options.orders.length === 0) {
    risks.push({
      id: "risk-empty-orders",
      severity: "info",
      summary: "No Shopify orders matched the date-bounded query in the retrieved pages.",
      evidenceIds: ["shopify:shop"],
    });
  }

  if (Object.keys(ecommerce.highlightedMetrics).length === 0) {
    risks.push({
      id: "risk-empty-ecommerce-metrics",
      severity: "info",
      summary: "GA4 ecommerce overview metrics are missing for this window.",
      evidenceIds: ["ga4:property"],
    });
  }

  return risks;
}

function collectRecommendations(
  observations: readonly ObservationFinding[],
  opportunities: readonly OpportunityFinding[],
  risks: readonly RiskFinding[],
): RecommendationFinding[] {
  const recommendations: RecommendationFinding[] = [];

  for (const opportunity of opportunities) {
    recommendations.push({
      id: `rec-${opportunity.id}`,
      action: opportunity.summary,
      rationale: "Derived from observed provider metrics in this bounded run.",
      evidenceIds: opportunity.evidenceIds,
    });
  }

  if (risks.some((risk) => risk.id === "risk-order-pagination")) {
    recommendations.push({
      id: "rec-expand-shopify-sample",
      action: "Increase order sample pages only after reviewing the current sample representativeness.",
      rationale: "Pagination indicates additional Shopify orders outside the sample.",
      evidenceIds: ["shopify:shop", "risk-order-pagination"],
    });
  }

  if (observations.some((obs) => obs.id === "obs-currency-mismatch")) {
    recommendations.push({
      id: "rec-currency-alignment",
      action: "Compare Shopify and GA4 monetary KPIs separately; align FX and tax reporting outside this agent.",
      rationale: "Cross-provider currency mismatch prevents safe revenue reconciliation.",
      evidenceIds: ["shopify:shop", "ga4:property", "obs-currency-mismatch"],
    });
  }

  return recommendations;
}
