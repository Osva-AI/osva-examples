import { describe, expect, it } from "vitest";

import { buildShopifyOrderSearchQuery, parseCommerceGrowthInput } from "../src/input.js";

describe("commerce growth input validation", () => {
  it("parses a valid request", () => {
    const parsed = parseCommerceGrowthInput({
      startDate: "2025-06-01",
      endDate: "2025-06-30",
      ga4PropertyId: "123456789",
      maxOrderSampleSize: 10,
      maxProductSampleSize: 5,
    });
    expect(parsed.startDate).toBe("2025-06-01");
    expect(parsed.ga4PropertyId).toBe("123456789");
  });

  it("rejects inverted date ranges", () => {
    expect(() =>
      parseCommerceGrowthInput({
        startDate: "2025-07-01",
        endDate: "2025-06-01",
        ga4PropertyId: "123",
        maxOrderSampleSize: 1,
        maxProductSampleSize: 1,
      }),
    ).toThrow(/startDate/);
  });

  it("builds bounded Shopify order search query", () => {
    expect(buildShopifyOrderSearchQuery("2025-06-01", "2025-06-30")).toBe(
      "created_at:>=2025-06-01 created_at:<=2025-06-30",
    );
  });
});
