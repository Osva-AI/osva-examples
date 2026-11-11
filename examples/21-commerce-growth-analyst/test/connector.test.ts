import { describe, expect, it } from "vitest";

import {
  APPROVED_GA4_READ_TOOLS,
  APPROVED_SHOPIFY_READ_TOOLS,
  assertGa4ReadOnlyDiscovery,
  assertImportedToolsAreReadOnly,
  assertShopifyReadOnlyDiscovery,
} from "../src/connector/read-only-tools.js";

describe("read-only connector inventory", () => {
  it("requires approved Shopify tools at discovery", () => {
    assertShopifyReadOnlyDiscovery([
      "shopify.shop.get",
      "shopify.product.list",
      "shopify.order.list",
      "shopify.order.get",
    ]);
    expect(() => assertShopifyReadOnlyDiscovery(["shopify.shop.get"])).toThrow(/shopify.product.list/);
  });

  it("requires approved GA4 tools at discovery", () => {
    assertGa4ReadOnlyDiscovery([
      "ga4.property.get",
      "ga4.report.acquisition",
      "ga4.report.ecommerce",
      "ga4.report.run",
    ]);
  });

  it("rejects disallowed imports", () => {
    expect(() => assertImportedToolsAreReadOnly(["shopify.order.get"])).toThrow(/Disallowed/);
    expect(() => assertImportedToolsAreReadOnly(["ga4.report.run"])).toThrow(/Disallowed/);
    assertImportedToolsAreReadOnly([...APPROVED_SHOPIFY_READ_TOOLS, ...APPROVED_GA4_READ_TOOLS]);
  });
});
