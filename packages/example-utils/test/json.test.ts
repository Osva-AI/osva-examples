import { describe, expect, it } from "vitest";

import { isJsonRecord } from "../src/json.js";

describe("isJsonRecord", () => {
  it("accepts plain objects and rejects arrays", () => {
    expect(isJsonRecord({ text: "ok" })).toBe(true);
    expect(isJsonRecord(["x"])).toBe(false);
    expect(isJsonRecord(null)).toBe(false);
    expect(isJsonRecord("text")).toBe(false);
  });
});
