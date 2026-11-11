import type { JsonValue } from "@osva-ai/contracts";
import { LIST_MAX_LIMIT as SHOPIFY_LIST_MAX_LIMIT } from "@osva-ai/connector-shopify";
import { isJsonRecord } from "@osva-examples/utils";

/** Matches `@osva-ai/connector-ga4@0.1.1` reporting window cap. */
const REPORT_MAX_DATE_RANGE_DAYS = 366;

export const MAX_ORDER_SAMPLE_ABSOLUTE = 100;
export const MAX_PRODUCT_SAMPLE_ABSOLUTE = 50;
export const MAX_LIST_PAGE_LIMIT = 5;
export const MAX_GA4_REPORT_LIMIT = 100;

export interface CommerceGrowthAnalystInput {
  readonly startDate: string;
  readonly endDate: string;
  readonly ga4PropertyId: string;
  readonly maxOrderSampleSize: number;
  readonly maxProductSampleSize: number;
  readonly orderListPageLimit: number;
  readonly productListPageLimit: number;
  readonly ga4ReportLimit: number;
  readonly runKey: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseCommerceGrowthInput(input: JsonValue): CommerceGrowthAnalystInput {
  if (!isJsonRecord(input)) {
    throw new Error("Run input must be an object with startDate, endDate, and ga4PropertyId.");
  }

  const startDate = parseIsoDate(input["startDate"], "startDate", true);
  const endDate = parseIsoDate(input["endDate"], "endDate", true);
  assertDateRange(startDate, endDate);

  const ga4PropertyId = parseGa4PropertyId(input["ga4PropertyId"]);

  const maxOrderSampleSize = parseBoundedPositiveInt(
    input["maxOrderSampleSize"],
    "maxOrderSampleSize",
    1,
    Math.min(MAX_ORDER_SAMPLE_ABSOLUTE, SHOPIFY_LIST_MAX_LIMIT),
    true,
  );
  const maxProductSampleSize = parseBoundedPositiveInt(
    input["maxProductSampleSize"],
    "maxProductSampleSize",
    1,
    Math.min(MAX_PRODUCT_SAMPLE_ABSOLUTE, SHOPIFY_LIST_MAX_LIMIT),
    true,
  );
  const orderListPageLimit = parseBoundedPositiveInt(
    input["orderListPageLimit"],
    "orderListPageLimit",
    1,
    MAX_LIST_PAGE_LIMIT,
    false,
  );
  const productListPageLimit = parseBoundedPositiveInt(
    input["productListPageLimit"],
    "productListPageLimit",
    1,
    MAX_LIST_PAGE_LIMIT,
    false,
  );
  const ga4ReportLimit = parseBoundedPositiveInt(
    input["ga4ReportLimit"],
    "ga4ReportLimit",
    1,
    MAX_GA4_REPORT_LIMIT,
    false,
  );

  const runKeyRaw = input["runKey"];
  const runKey =
    typeof runKeyRaw === "string" && runKeyRaw.trim().length > 0
      ? runKeyRaw.trim()
      : `${ga4PropertyId}:${startDate}:${endDate}`;

  return {
    startDate,
    endDate,
    ga4PropertyId,
    maxOrderSampleSize,
    maxProductSampleSize,
    orderListPageLimit,
    productListPageLimit,
    ga4ReportLimit,
    runKey,
  };
}

export function buildShopifyOrderSearchQuery(startDate: string, endDate: string): string {
  return `created_at:>=${startDate} created_at:<=${endDate}`;
}

function parseIsoDate(value: unknown, field: string, required: boolean): string {
  if (value === undefined) {
    if (required) throw new Error(`Run input must include '${field}' (YYYY-MM-DD).`);
    throw new Error(`Missing ${field}.`);
  }
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value.trim())) {
    throw new Error(`'${field}' must be an ISO date string YYYY-MM-DD.`);
  }
  return value.trim();
}

function assertDateRange(startDate: string, endDate: string): void {
  if (startDate > endDate) {
    throw new Error("startDate must be on or before endDate.");
  }
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error("startDate and endDate must be valid calendar dates.");
  }
  const inclusiveDays = Math.floor((end - start) / 86_400_000) + 1;
  if (inclusiveDays > REPORT_MAX_DATE_RANGE_DAYS) {
    throw new Error(`Date range exceeds GA4 connector maximum of ${REPORT_MAX_DATE_RANGE_DAYS} days.`);
  }
}

function parseGa4PropertyId(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Run input must include string 'ga4PropertyId'.");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 32) {
    throw new Error("'ga4PropertyId' must be a non-empty property identifier (max 32 characters).");
  }
  if (!/^[\dA-Za-z_-]+$/.test(trimmed)) {
    throw new Error("'ga4PropertyId' contains invalid characters.");
  }
  return trimmed;
}

function parseBoundedPositiveInt(value: unknown, field: string, min: number, max: number, required: boolean): number {
  if (value === undefined) {
    if (required) throw new Error(`Run input must include positive integer '${field}'.`);
    return min;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`'${field}' must be an integer.`);
  }
  if (value < min || value > max) {
    throw new Error(`'${field}' must be between ${min} and ${max}.`);
  }
  return value;
}
