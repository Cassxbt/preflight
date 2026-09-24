import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "./canonical";
import { isSignature } from "./receipt";

describe("isSignature", () => {
  it("accepts only base58 strings that decode to 64 bytes", () => {
    expect(isSignature("5XcWu1fa7tvQqDHuVynJ4rNbpnFBHgtTHHhz1wXnim1C3xvVfoBjVYLVKJNu8HQsgtiWrSurLPZWeUcrjwPqwXPV")).toBe(true);
    expect(isSignature("z".repeat(88))).toBe(false);
    expect(isSignature("abc")).toBe(false);
    expect(isSignature("0OIl".repeat(22))).toBe(false);
  });
});

describe("verdict hash", () => {
  it("recomputes from the stored JSON exactly as it was computed from the live object", () => {
    const verdict = { schema: "preflight.verdict.v1", usdcInRaw: 2_000_000n, reasons: [{ code: "ABOVE_MARK" }], b: null, a: 1.5 };
    const stored = JSON.parse(canonicalJson(verdict));
    expect(sha256Hex(canonicalJson(stored))).toBe(sha256Hex(canonicalJson(verdict)));
  });
});
