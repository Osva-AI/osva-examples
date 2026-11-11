import { describe, expect, it, vi } from "vitest";

import { runCommerceGrowthAnalystAgent } from "../src/agent.js";
import {
  FIXTURE_ACQUISITION_REPORT,
  FIXTURE_ECOMMERCE_REPORT,
  FIXTURE_GA4_PROPERTY,
  FIXTURE_ORDER_LIST,
  FIXTURE_PRODUCT_LIST,
  FIXTURE_SHOP,
} from "../src/fixtures.js";
import { FIXTURE_GA4_PROPERTY_ID, FIXTURE_RUN_KEY } from "../src/bindings.js";

describe("commerce growth agent fixture path", () => {
  it("runs without live provider calls", async () => {
    const invoke = vi.fn();
    const output = await runCommerceGrowthAnalystAgent({
      input: {
        startDate: "2025-06-01",
        endDate: "2025-06-30",
        ga4PropertyId: FIXTURE_GA4_PROPERTY_ID,
        maxOrderSampleSize: 10,
        maxProductSampleSize: 10,
        runKey: FIXTURE_RUN_KEY,
      },
      tools: { invoke },
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(output.runKey).toBe(FIXTURE_RUN_KEY);
    expect(output.commerce.sampledOrderCount).toBeGreaterThan(0);
  });
});

describe("commerce growth agent multi-source path", () => {
  it("invokes both connectors in read-only order", async () => {
    const invoke = vi.fn(async (binding: string) => {
      if (binding === "shopify.shop.get") return FIXTURE_SHOP;
      if (binding === "shopify.product.list") return FIXTURE_PRODUCT_LIST;
      if (binding === "shopify.order.list") return FIXTURE_ORDER_LIST;
      if (binding === "ga4.property.get") return FIXTURE_GA4_PROPERTY;
      if (binding === "ga4.report.acquisition") return FIXTURE_ACQUISITION_REPORT;
      if (binding === "ga4.report.ecommerce") return FIXTURE_ECOMMERCE_REPORT;
      throw new Error(`unexpected tool ${binding}`);
    });

    const output = await runCommerceGrowthAnalystAgent({
      input: {
        startDate: "2025-06-01",
        endDate: "2025-06-30",
        ga4PropertyId: "999888777",
        maxOrderSampleSize: 10,
        maxProductSampleSize: 10,
        runKey: "unit-multi-source",
      },
      tools: { invoke },
    });

    expect(invoke).toHaveBeenCalledTimes(6);
    expect(output.acquisition.topChannelsBySessions[0]?.channel).toBe("Organic Search");
    expect(output.evidence.some((item) => item.kind === "ga4")).toBe(true);
  });
});
