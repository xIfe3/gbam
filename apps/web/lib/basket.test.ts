import { afterEach, describe, expect, it, vi } from "vitest";
import type { StorefrontProduct } from "./api";
import {
  addLine,
  basketTotals,
  checkBasket,
  readBasket,
  setQuantity,
  type BasketLine,
} from "./basket";

function makeLine(overrides: Partial<BasketLine> = {}): BasketLine {
  return {
    variantId: "v1",
    productSlug: "slides",
    productName: "Leather slides",
    variantTitle: "42",
    priceKobo: 500000,
    photoUrl: null,
    quantity: 1,
    ...overrides,
  };
}

function makeProduct(stock: number | null, priceKobo = 500000): StorefrontProduct {
  return {
    slug: "slides",
    name: "Leather slides",
    description: null,
    images: [],
    options: [],
    variants: [{ id: "v1", optionValues: [], title: "42", priceKobo, stock, imageId: null }],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("addLine", () => {
  it("adds a new variant as a new line", () => {
    const result = addLine([makeLine()], makeLine({ variantId: "v2" }));
    expect(result).toHaveLength(2);
  });

  it("adds quantities when the variant is already in the basket", () => {
    const result = addLine([makeLine({ quantity: 2 })], makeLine({ quantity: 3 }));
    expect(result).toHaveLength(1);
    expect(result[0]?.quantity).toBe(5);
  });

  it("caps the quantity at 99", () => {
    const result = addLine([makeLine({ quantity: 98 })], makeLine({ quantity: 5 }));
    expect(result[0]?.quantity).toBe(99);
  });
});

describe("setQuantity", () => {
  it("changes the quantity of one line", () => {
    const result = setQuantity([makeLine()], "v1", 4);
    expect(result[0]?.quantity).toBe(4);
  });

  it("removes the line when the quantity is 0", () => {
    const result = setQuantity([makeLine()], "v1", 0);
    expect(result).toEqual([]);
  });
});

describe("basketTotals", () => {
  it("counts items and sums price times quantity", () => {
    const lines = [
      makeLine({ quantity: 2, priceKobo: 500000 }),
      makeLine({ variantId: "v2", quantity: 1, priceKobo: 250000 }),
    ];
    expect(basketTotals(lines)).toEqual({ itemCount: 3, totalKobo: 1250000 });
  });
});

describe("readBasket", () => {
  it("returns an empty basket when localStorage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readBasket("broken-shop")).toEqual([]);
  });

  it("drops stored lines with an impossible quantity or price", () => {
    const stored = [
      makeLine({ variantId: "ok" }),
      makeLine({ variantId: "zero", quantity: 0 }),
      makeLine({ variantId: "huge", quantity: 100 }),
      makeLine({ variantId: "fraction", quantity: 1.5 }),
      makeLine({ variantId: "negative", priceKobo: -1 }),
    ];
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(stored) });
    const lines = readBasket("tampered-shop");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.variantId).toBe("ok");
  });

  it("returns an empty basket when the stored text is not a basket", () => {
    vi.stubGlobal("localStorage", { getItem: () => "{not json" });
    expect(readBasket("junk-shop")).toEqual([]);
  });
});

describe("checkBasket", () => {
  it("flags a product that no longer exists as gone", () => {
    const problems = checkBasket([makeLine()], []);
    expect(problems[0]?.problem).toBe("gone");
  });

  it("flags a variant that no longer exists as gone", () => {
    const problems = checkBasket([makeLine({ variantId: "other" })], [makeProduct(5)]);
    expect(problems[0]?.problem).toBe("gone");
  });

  it("flags a variant with no stock as sold out", () => {
    const problems = checkBasket([makeLine()], [makeProduct(0)]);
    expect(problems[0]?.problem).toBe("sold_out");
  });

  it("flags a quantity above stock as only N left", () => {
    const problems = checkBasket([makeLine({ quantity: 3 })], [makeProduct(2)]);
    expect(problems[0]?.problem).toBe("only_n_left");
    expect(problems[0]?.left).toBe(2);
  });

  it("flags a changed price with the new price", () => {
    const problems = checkBasket([makeLine()], [makeProduct(null, 600000)]);
    expect(problems[0]?.problem).toBe("price_changed");
    expect(problems[0]?.newPriceKobo).toBe(600000);
  });

  it("reports nothing for a healthy basket", () => {
    const problems = checkBasket([makeLine({ quantity: 2 })], [makeProduct(2)]);
    expect(problems).toEqual([]);
  });
});
