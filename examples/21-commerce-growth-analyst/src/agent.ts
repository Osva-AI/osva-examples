import { LIST_MAX_LIMIT } from "@osva-ai/connector-shopify";

import {
  TOOL_BINDING_GA4_PROPERTY_GET,
  TOOL_BINDING_GA4_REPORT_ACQUISITION,
  TOOL_BINDING_GA4_REPORT_ECOMMERCE,
  TOOL_BINDING_SHOPIFY_ORDER_LIST,
  TOOL_BINDING_SHOPIFY_PRODUCT_LIST,
  TOOL_BINDING_SHOPIFY_SHOP_GET,
  toolIdempotencyKey,
} from "./bindings.js";
import { buildCommerceGrowthBrief, buildSamplingMetadata } from "./analysis.js";
import { buildDeterministicFixtureBrief, isFixtureRun } from "./fixtures.js";
import { buildShopifyOrderSearchQuery, parseCommerceGrowthInput } from "./input.js";
import type { NormalizedOrderSnapshot, NormalizedProductSnapshot } from "./normalize.js";
import {
  normalizeGa4Property,
  normalizeGa4Report,
  normalizeOrderRecord,
  normalizeProductRecord,
  normalizeShopRecord,
} from "./normalize.js";
import type { CommerceGrowthStructuredOutput, TrustedCommerceGrowthContext } from "./agent-types.js";

interface ListPageInfo {
  readonly hasNextPage?: boolean;
  readonly endCursor?: string;
}

export async function runCommerceGrowthAnalystAgent(
  context: TrustedCommerceGrowthContext,
): Promise<CommerceGrowthStructuredOutput> {
  const request = parseCommerceGrowthInput(context.input);
  const analysisTimestamp = new Date().toISOString();

  if (isFixtureRun(request.runKey, request.ga4PropertyId)) {
    const brief = buildDeterministicFixtureBrief(request.startDate, request.endDate);
    return {
      ...brief,
      startDate: request.startDate,
      endDate: request.endDate,
      ga4PropertyId: request.ga4PropertyId,
      analysisTimestamp,
      runKey: request.runKey,
    };
  }

  const shopRaw = await context.tools.invoke(
    TOOL_BINDING_SHOPIFY_SHOP_GET,
    {},
    { idempotencyKey: toolIdempotencyKey(request.runKey, TOOL_BINDING_SHOPIFY_SHOP_GET) },
  );
  const shop = normalizeShopRecord(shopRaw);

  const products = await fetchBoundedProductList(context, request);
  const orders = await fetchBoundedOrderList(context, request);

  const ga4PropertyRaw = await context.tools.invoke(
    TOOL_BINDING_GA4_PROPERTY_GET,
    { propertyId: request.ga4PropertyId },
    { idempotencyKey: toolIdempotencyKey(request.runKey, TOOL_BINDING_GA4_PROPERTY_GET) },
  );
  const ga4Property = normalizeGa4Property(ga4PropertyRaw);

  const acquisitionRaw = await context.tools.invoke(
    TOOL_BINDING_GA4_REPORT_ACQUISITION,
    {
      propertyId: request.ga4PropertyId,
      startDate: request.startDate,
      endDate: request.endDate,
      limit: request.ga4ReportLimit,
      offset: 0,
    },
    { idempotencyKey: toolIdempotencyKey(request.runKey, TOOL_BINDING_GA4_REPORT_ACQUISITION) },
  );

  const ecommerceRaw = await context.tools.invoke(
    TOOL_BINDING_GA4_REPORT_ECOMMERCE,
    {
      propertyId: request.ga4PropertyId,
      startDate: request.startDate,
      endDate: request.endDate,
      breakdown: "overview",
      limit: request.ga4ReportLimit,
      offset: 0,
    },
    { idempotencyKey: toolIdempotencyKey(request.runKey, TOOL_BINDING_GA4_REPORT_ECOMMERCE) },
  );

  const brief = buildCommerceGrowthBrief({
    startDate: request.startDate,
    endDate: request.endDate,
    shop,
    ga4Property,
    products: products.items,
    orders: orders.items,
    acquisition: normalizeGa4Report(acquisitionRaw),
    ecommerce: normalizeGa4Report(ecommerceRaw),
    orderSampling: orders.orderSampling,
    productSampling: products.productSampling,
  });

  return {
    ...brief,
    startDate: request.startDate,
    endDate: request.endDate,
    ga4PropertyId: request.ga4PropertyId,
    analysisTimestamp,
    runKey: request.runKey,
  };
}

async function fetchBoundedProductList(
  context: TrustedCommerceGrowthContext,
  request: ReturnType<typeof parseCommerceGrowthInput>,
): Promise<{
  readonly items: NormalizedProductSnapshot[];
  readonly productSampling: ReturnType<typeof buildSamplingMetadata>;
}> {
  const perPage = Math.min(request.maxProductSampleSize, LIST_MAX_LIMIT);
  const collected: NormalizedProductSnapshot[] = [];
  let pagesFetched = 0;
  let cursor: string | undefined;
  let hasMoreOnProvider = false;

  for (let page = 1; page <= request.productListPageLimit && collected.length < request.maxProductSampleSize; page++) {
    pagesFetched += 1;
    const listRaw = (await context.tools.invoke(
      TOOL_BINDING_SHOPIFY_PRODUCT_LIST,
      {
        limit: perPage,
        ...(cursor === undefined ? {} : { cursor }),
      },
      { idempotencyKey: `${toolIdempotencyKey(request.runKey, TOOL_BINDING_SHOPIFY_PRODUCT_LIST)}:p${page}` },
    )) as { products?: unknown[]; pageInfo?: ListPageInfo };

    for (const product of listRaw.products ?? []) {
      const normalized = normalizeProductRecord(product);
      if (normalized === null) continue;
      if (collected.length >= request.maxProductSampleSize) break;
      collected.push(normalized);
    }

    hasMoreOnProvider = listRaw.pageInfo?.hasNextPage === true;
    cursor = listRaw.pageInfo?.endCursor;
    if (!hasMoreOnProvider || collected.length >= request.maxProductSampleSize) break;
  }

  return {
    items: collected,
    productSampling: buildSamplingMetadata({
      requestedSampleSize: request.maxProductSampleSize,
      sampledCount: collected.length,
      pagesFetched,
      hasMoreOnProvider,
    }),
  };
}

async function fetchBoundedOrderList(
  context: TrustedCommerceGrowthContext,
  request: ReturnType<typeof parseCommerceGrowthInput>,
): Promise<{
  readonly items: NormalizedOrderSnapshot[];
  readonly orderSampling: ReturnType<typeof buildSamplingMetadata>;
}> {
  const perPage = Math.min(request.maxOrderSampleSize, LIST_MAX_LIMIT);
  const query = buildShopifyOrderSearchQuery(request.startDate, request.endDate);
  const collected: NormalizedOrderSnapshot[] = [];
  let pagesFetched = 0;
  let cursor: string | undefined;
  let hasMoreOnProvider = false;

  for (let page = 1; page <= request.orderListPageLimit && collected.length < request.maxOrderSampleSize; page++) {
    pagesFetched += 1;
    const listRaw = (await context.tools.invoke(
      TOOL_BINDING_SHOPIFY_ORDER_LIST,
      {
        limit: perPage,
        query,
        ...(cursor === undefined ? {} : { cursor }),
      },
      { idempotencyKey: `${toolIdempotencyKey(request.runKey, TOOL_BINDING_SHOPIFY_ORDER_LIST)}:p${page}` },
    )) as { orders?: unknown[]; pageInfo?: ListPageInfo };

    for (const order of listRaw.orders ?? []) {
      const normalized = normalizeOrderRecord(order);
      if (normalized === null) continue;
      if (collected.length >= request.maxOrderSampleSize) break;
      collected.push(normalized);
    }

    hasMoreOnProvider = listRaw.pageInfo?.hasNextPage === true;
    cursor = listRaw.pageInfo?.endCursor;
    if (!hasMoreOnProvider || collected.length >= request.maxOrderSampleSize) break;
  }

  return {
    items: collected,
    orderSampling: buildSamplingMetadata({
      requestedSampleSize: request.maxOrderSampleSize,
      sampledCount: collected.length,
      pagesFetched,
      hasMoreOnProvider,
    }),
  };
}
