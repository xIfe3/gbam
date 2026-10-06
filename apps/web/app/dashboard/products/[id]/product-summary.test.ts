import { describe, expect, it } from "vitest";
import { priceRangeText, stockLabel, summaryText, type SummaryVariant } from "./product-summary";

function v(overrides: Partial<SummaryVariant>): SummaryVariant {
  return { priceKobo: 1200000, stock: 5, isEnabled: true, ...overrides };
}

describe("product summary helpers", () => {
  it("labels stock: left, sold out, not tracked", () => {
    expect(stockLabel(v({ stock: 12 }))).toBe("12 left");
    expect(stockLabel(v({ stock: 0 }))).toBe("Sold out");
    expect(stockLabel(v({ stock: null }))).toBe("Not tracked");
  });

  it("price range uses only switched-on combinations", () => {
    const variants = [
      v({ priceKobo: 1200000 }),
      v({ priceKobo: 1500000 }),
      v({ priceKobo: 900000, isEnabled: false }),
    ];
    expect(priceRangeText(variants)).toBe("₦12,000 – ₦15,000");
    expect(priceRangeText([v({ priceKobo: 350000 })])).toBe("₦3,500");
    expect(priceRangeText([v({ isEnabled: false })])).toBe("Nothing switched on");
  });

  it("sums up what customers can actually buy", () => {
    const variants = [
      v({ stock: 10 }),
      v({ stock: 0 }),
      v({ stock: null }),
      v({ stock: 13 }),
      v({ stock: 4, isEnabled: false }),
    ];
    expect(summaryText(variants)).toBe(
      "5 combinations · 3 on sale · 1 sold out · 23 in stock in total",
    );
  });

  it("leaves out the stock total when nothing is tracked, and says 1 combination", () => {
    expect(summaryText([v({ stock: null })])).toBe("1 combination · 1 on sale · 0 sold out");
  });
});
