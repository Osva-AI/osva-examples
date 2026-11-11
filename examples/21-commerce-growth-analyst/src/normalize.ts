import { isJsonRecord } from "@osva-examples/utils";

export interface NormalizedShopSnapshot {
  readonly id: string;
  readonly name: string;
  readonly myshopifyDomain: string;
  readonly currencyCode: string;
  readonly ianaTimezone: string;
}

export interface NormalizedProductSnapshot {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly totalInventory: number | null;
  readonly vendor: string;
}

export interface NormalizedOrderSnapshot {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly financialStatus: string;
  readonly fulfillmentStatus: string;
  readonly totalAmount: string;
  readonly currencyCode: string;
}

export interface NormalizedGa4PropertySnapshot {
  readonly id: string;
  readonly displayName: string;
  readonly timeZone: string;
  readonly currencyCode: string;
}

export interface NormalizedGa4ReportSnapshot {
  readonly propertyId: string;
  readonly dimensionHeaders: readonly string[];
  readonly metricHeaders: readonly string[];
  readonly rows: readonly {
    readonly dimensions: readonly string[];
    readonly metrics: readonly string[];
  }[];
  readonly rowCount: number;
  readonly rowCountIsLowerBound: boolean;
  readonly limit: number;
  readonly offset: number;
  readonly rowsReturned: number;
  readonly hasMoreRows: boolean;
  readonly currencyCode?: string;
  readonly timeZone?: string;
}

export function normalizeShopRecord(record: unknown): NormalizedShopSnapshot {
  if (!isJsonRecord(record as never)) {
    throw new Error("Shopify shop.get output must be an object.");
  }
  const data = record as Record<string, unknown>;
  return {
    id: readString(data, "id"),
    name: sanitizeProviderText(readString(data, "name")),
    myshopifyDomain: readString(data, "myshopifyDomain"),
    currencyCode: readString(data, "currencyCode"),
    ianaTimezone: readString(data, "ianaTimezone"),
  };
}

export function normalizeProductRecord(record: unknown): NormalizedProductSnapshot | null {
  if (!isJsonRecord(record as never)) return null;
  const data = record as Record<string, unknown>;
  const id = readOptionalString(data, "id");
  if (id === undefined) return null;
  return {
    id,
    title: sanitizeProviderText(readOptionalString(data, "title") ?? "(untitled)"),
    status: readOptionalString(data, "status") ?? "unknown",
    totalInventory: readOptionalNumber(data["totalInventory"]),
    vendor: sanitizeProviderText(readOptionalString(data, "vendor") ?? ""),
  };
}

export function normalizeOrderRecord(record: unknown): NormalizedOrderSnapshot | null {
  if (!isJsonRecord(record as never)) return null;
  const data = record as Record<string, unknown>;
  const id = readOptionalString(data, "id");
  if (id === undefined) return null;
  const money = extractShopMoney(data["currentTotalPriceSet"]);
  return {
    id,
    name: sanitizeProviderText(readOptionalString(data, "name") ?? id),
    createdAt: readOptionalString(data, "createdAt") ?? "",
    financialStatus: readOptionalString(data, "displayFinancialStatus") ?? "unknown",
    fulfillmentStatus: readOptionalString(data, "displayFulfillmentStatus") ?? "unknown",
    totalAmount: money.amount,
    currencyCode: money.currencyCode,
  };
}

export function normalizeGa4Property(record: unknown): NormalizedGa4PropertySnapshot {
  if (!isJsonRecord(record as never)) {
    throw new Error("GA4 property.get output must be an object.");
  }
  const data = record as Record<string, unknown>;
  return {
    id: readString(data, "id"),
    displayName: sanitizeProviderText(readString(data, "displayName")),
    timeZone: readString(data, "timeZone"),
    currencyCode: readString(data, "currencyCode"),
  };
}

export function normalizeGa4Report(record: unknown): NormalizedGa4ReportSnapshot {
  if (!isJsonRecord(record as never)) {
    throw new Error("GA4 report output must be an object.");
  }
  const data = record as Record<string, unknown>;
  const dimensionHeaders = readHeaderNames(data["dimensionHeaders"]);
  const metricHeaders = readHeaderNames(data["metricHeaders"]);
  const rows = readReportRows(data["rows"]);
  const metadata = isJsonRecord(data["metadata"] as never) ? (data["metadata"] as Record<string, unknown>) : undefined;

  return {
    propertyId: readString(data, "propertyId"),
    dimensionHeaders,
    metricHeaders,
    rows,
    rowCount: typeof data["rowCount"] === "number" ? data["rowCount"] : rows.length,
    rowCountIsLowerBound: data["rowCountIsLowerBound"] === true,
    limit: typeof data["limit"] === "number" ? data["limit"] : rows.length,
    offset: typeof data["offset"] === "number" ? data["offset"] : 0,
    rowsReturned: typeof data["rowsReturned"] === "number" ? data["rowsReturned"] : rows.length,
    hasMoreRows: data["hasMoreRows"] === true,
    ...(metadata?.["currencyCode"] !== undefined
      ? { currencyCode: sanitizeProviderText(String(metadata["currencyCode"])) }
      : {}),
    ...(metadata?.["timeZone"] !== undefined ? { timeZone: sanitizeProviderText(String(metadata["timeZone"])) } : {}),
  };
}

export function sanitizeProviderText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 256);
}

function readReportRows(value: unknown): NormalizedGa4ReportSnapshot["rows"] {
  if (!Array.isArray(value)) return [];
  const out: NormalizedGa4ReportSnapshot["rows"][number][] = [];
  for (const row of value) {
    if (!isJsonRecord(row as never)) continue;
    const record = row as Record<string, unknown>;
    const dimensionValues = Array.isArray(record["dimensionValues"])
      ? record["dimensionValues"].map((item) => sanitizeProviderText(String(item)))
      : [];
    const metricValues = Array.isArray(record["metricValues"])
      ? record["metricValues"].map((item) => sanitizeProviderText(String(item)))
      : [];
    out.push({ dimensions: dimensionValues, metrics: metricValues });
  }
  return out;
}

function readHeaderNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    if (isJsonRecord(item as never)) {
      const record = item as Record<string, unknown>;
      if (typeof record["name"] === "string") names.push(record["name"]);
      continue;
    }
    if (typeof item === "string") names.push(item);
  }
  return names;
}

function extractShopMoney(value: unknown): { readonly amount: string; readonly currencyCode: string } {
  if (!isJsonRecord(value as never)) return { amount: "0", currencyCode: "unknown" };
  const shopMoney = (value as Record<string, unknown>)["shopMoney"];
  if (!isJsonRecord(shopMoney as never)) return { amount: "0", currencyCode: "unknown" };
  const money = shopMoney as Record<string, unknown>;
  return {
    amount: readOptionalString(money, "amount") ?? "0",
    currencyCode: readOptionalString(money, "currencyCode") ?? "unknown",
  };
}

function readString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Provider object missing string '${field}'.`);
  }
  return value.trim();
}

function readOptionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function readOptionalNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}
