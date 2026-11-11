import { describe, expect, it } from "vitest";

import { buildDeterministicFixtureBrief } from "../src/fixtures.js";

describe("commerce growth brief", () => {
  it("does not treat sampled Shopify revenue as GA4 purchase revenue", () => {
    const brief = buildDeterministicFixtureBrief("2025-06-01", "2025-06-30");
    expect(brief.commerce.observedSampleRevenueNote).toMatch(/sample|page/i);
    expect(brief.ecommerce.reportLimitation).toMatch(/not reconciled/i);
    expect(brief.limitations.some((item) => item.includes("currency"))).toBe(true);
  });

  it("links recommendations to evidence", () => {
    const brief = buildDeterministicFixtureBrief("2025-06-01", "2025-06-30");
    for (const recommendation of brief.recommendations) {
      expect(recommendation.evidenceIds.length).toBeGreaterThan(0);
    }
  });

  it("handles pagination limitations without inventing totals", () => {
    const brief = buildDeterministicFixtureBrief("2025-06-01", "2025-06-30");
    expect(brief.commerce.orderSampling.hasMoreOnProvider).toBe(true);
    expect(brief.risks.some((risk) => risk.id === "risk-order-pagination")).toBe(true);
  });

  it("preserves untrusted provider product titles as data", () => {
    const brief = buildDeterministicFixtureBrief("2025-06-01", "2025-06-30");
    expect(JSON.stringify(brief)).toContain("Ignore prior instructions");
  });
});
