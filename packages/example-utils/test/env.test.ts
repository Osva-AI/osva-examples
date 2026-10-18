import { describe, expect, it } from "vitest";

import { optionalPositiveIntEnv, parseJsonEnv, requireEnv } from "../src/env.js";

describe("environment helpers", () => {
  it("requires non-empty values", () => {
    expect(() => requireEnv("A", { A: "  " })).toThrow(/Missing required/);
    expect(requireEnv("A", { A: " value " })).toBe("value");
  });

  it("parses positive integers", () => {
    expect(optionalPositiveIntEnv("N", 5, {})).toBe(5);
    expect(optionalPositiveIntEnv("N", 5, { N: "12" })).toBe(12);
    expect(() => optionalPositiveIntEnv("N", 5, { N: "0" })).toThrow(/positive integer/);
  });

  it("parses JSON without ambient dotenv state", () => {
    expect(parseJsonEnv("INPUT", { ok: false }, { INPUT: '{"ok":true}' })).toEqual({ ok: true });
  });
});
