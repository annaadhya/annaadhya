import { describe, expect, it } from "vitest";
import { toPaise, formatINR, percentOf, applyBps, sumPaise, MoneyError, paiseSchema } from "../src/money";

describe("money (integer paise)", () => {
  it("parses rupee strings and numbers", () => {
    expect(toPaise("99")).toBe(9900);
    expect(toPaise("₹1,099.00")).toBe(109900);
    expect(toPaise("349.5")).toBe(34950);
    expect(toPaise(199)).toBe(19900);
    expect(toPaise("0.05")).toBe(5);
  });

  it("rejects malformed amounts", () => {
    expect(() => toPaise("1.999")).toThrow(MoneyError);
    expect(() => toPaise("abc")).toThrow(MoneyError);
    expect(() => toPaise(NaN)).toThrow(MoneyError);
    expect(() => toPaise(Infinity)).toThrow(MoneyError);
  });

  it("formats INR with Indian digit grouping", () => {
    expect(formatINR(109900)).toBe("₹1,099.00");
    expect(formatINR(99)).toBe("₹0.99");
    expect(formatINR(123456789)).toBe("₹12,34,567.89");
    expect(formatINR(150000, { withDecimals: false })).toBe("₹1,500");
  });

  it("rounds percent and bps computations to integer paise", () => {
    expect(percentOf(999, 5)).toBe(50); // 49.95 -> 50 (half-up, paise)
    expect(applyBps(10000, 500)).toBe(500);
    expect(applyBps(999, 500)).toBe(50); // 49.95 -> 50
    expect(sumPaise([9900, 19900, 34950])).toBe(64750);
  });

  it("rejects bad bps and non-integer storage", () => {
    expect(() => applyBps(100, 12345)).toThrow(MoneyError);
    expect(paiseSchema.safeParse(10.5).success).toBe(false);
    expect(paiseSchema.safeParse(-1).success).toBe(false);
    expect(paiseSchema.safeParse(0).success).toBe(true);
  });
});
