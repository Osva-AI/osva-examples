import { describe, expect, it } from "vitest";

import { transportConfigMatches } from "../src/bootstrap.js";
import { COMMERCE_GROWTH_TOOL_BINDINGS } from "../src/bindings.js";
import { buildRemoteHttpManifest } from "../src/runtime.js";

describe("bootstrap helpers", () => {
  it("matches equivalent MCP transport configs regardless of key order", () => {
    expect(
      transportConfigMatches(
        { command: "node", args: ["/tmp/stdio.js"] },
        { args: ["/tmp/stdio.js"], command: "node" },
      ),
    ).toBe(true);
  });

  it("declares only approved read-only tool bindings in the manifest", () => {
    const manifest = buildRemoteHttpManifest("http://127.0.0.1:8802/execute", {
      shopifyShopGet: "tv_shop" as never,
      shopifyProductList: "tv_products" as never,
      shopifyOrderList: "tv_orders" as never,
      ga4PropertyGet: "tv_property" as never,
      ga4ReportAcquisition: "tv_acq" as never,
      ga4ReportEcommerce: "tv_ecom" as never,
    });
    expect(manifest.capabilities.model).toBe(false);
    expect(manifest.capabilities.tools).toEqual([...COMMERCE_GROWTH_TOOL_BINDINGS]);
    expect(JSON.stringify(manifest)).not.toMatch(/shopify\.order\.get|ga4\.report\.run|shpat_|AIza/i);
  });
});
