import { describe, expect, it } from "vitest";
import { calculatePlatformFee, estimatePaystackFee } from "./fees";

const NOW = new Date("2026-10-03T12:00:00Z");

describe("calculatePlatformFee", () => {
  it("takes 1.5% of the order", () => {
    expect(calculatePlatformFee(1_000_000, null, NOW)).toBe(15_000); // ₦10,000 → ₦150
  });

  it("never takes more than ₦1,000", () => {
    expect(calculatePlatformFee(20_000_000, null, NOW)).toBe(100_000); // ₦200,000 → ₦1,000
  });

  it("rounds to whole kobo", () => {
    expect(calculatePlatformFee(333, null, NOW)).toBe(5); // 4.995 kobo → 5
  });

  it("charges nothing while a founding seller's waiver is active", () => {
    const nextMonth = new Date("2026-11-03T00:00:00Z");
    expect(calculatePlatformFee(1_000_000, nextMonth, NOW)).toBe(0);
  });

  it("charges normally once the waiver has ended", () => {
    const lastMonth = new Date("2026-09-03T00:00:00Z");
    expect(calculatePlatformFee(1_000_000, lastMonth, NOW)).toBe(15_000);
  });
});

describe("estimatePaystackFee", () => {
  it("is 1.5% with no flat fee under ₦2,500", () => {
    expect(estimatePaystackFee(200_000)).toBe(3_000); // ₦2,000 → ₦30
  });

  it("adds ₦100 from ₦2,500 up", () => {
    expect(estimatePaystackFee(1_000_000)).toBe(25_000); // ₦10,000 → ₦250
  });

  it("is capped at ₦2,000", () => {
    expect(estimatePaystackFee(50_000_000)).toBe(200_000);
  });
});
