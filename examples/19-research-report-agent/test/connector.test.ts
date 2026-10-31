import { describe, expect, it } from "vitest";

import { createNpmConnector, normalizeDownloadsDocument, normalizeRegistryDocument } from "@osva-ai/connector-npm";

describe("published @osva-ai/connector-npm (offline)", () => {
  it("exposes npm_package_metadata and npm_downloads tools", () => {
    const connector = createNpmConnector();
    const names = connector.tools.map((tool) => tool.name);
    expect(names).toEqual(["npm_package_metadata", "npm_downloads"]);
  });

  it("normalizes registry documents", () => {
    const metadata = normalizeRegistryDocument("lodash", {
      name: "lodash",
      "dist-tags": { latest: "4.17.21" },
      license: "MIT",
    });
    expect(metadata.latestVersion).toBe("4.17.21");
  });

  it("normalizes downloads documents", () => {
    const downloads = normalizeDownloadsDocument("lodash", "last-month", {
      downloads: 1000,
      start: "2020-01-01",
      end: "2020-02-01",
      package: "lodash",
    });
    expect(downloads.downloads).toBe(1000);
  });
});
