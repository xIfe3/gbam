import { describe, expect, it } from "vitest";
import {
  type ProductInput,
  combinations,
  parseNairaInput,
  productInputSchema,
  productSlugBase,
  variantTitle,
} from "./products";

const IMG_1 = "11111111-1111-4111-8111-111111111111";
const IMG_2 = "22222222-2222-4222-8222-222222222222";

type Variant = ProductInput["variants"][number];

// Replaces some fields of one variant (a plain loop-free helper keeps the tests readable).
function changeVariant(input: ProductInput, index: number, changes: Partial<Variant>) {
  const variant = input.variants[index];
  if (!variant) {
    throw new Error("No variant at index " + index);
  }
  input.variants[index] = { ...variant, ...changes };
}

function validProduct(): ProductInput {
  return {
    name: "Ankara Dress",
    imageIds: [IMG_1],
    options: [{ name: "Size", values: ["S", "M"] }],
    variants: [
      { optionValues: ["S"], priceKobo: 1000000, stock: 5, imageId: null, isEnabled: true },
      { optionValues: ["M"], priceKobo: 1200000, stock: null, imageId: null, isEnabled: true },
    ],
  };
}

describe("productSlugBase", () => {
  it("lowercases and hyphenates", () => {
    expect(productSlugBase("Ankara Wrap Dress!")).toBe("ankara-wrap-dress");
  });
  it("falls back to product", () => {
    expect(productSlugBase("  ")).toBe("product");
  });
  it("reserves order", () => {
    expect(productSlugBase("Order")).toBe("order-1");
  });
  it("cuts long names to 60 chars with no trailing hyphen", () => {
    const slug = productSlugBase("a".repeat(59) + " bbbbbbbbbbbbbbbbbbbb");
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("variantTitle", () => {
  it("joins values", () => {
    expect(variantTitle(["M", "Red"])).toBe("M / Red");
    expect(variantTitle([])).toBe("");
  });
});

describe("combinations", () => {
  it("builds the cartesian product in option order", () => {
    const result = combinations([
      { name: "Size", values: ["S", "M"] },
      { name: "Colour", values: ["Red"] },
    ]);
    expect(result).toEqual([
      ["S", "Red"],
      ["M", "Red"],
    ]);
  });
  it("gives one empty combination for no options", () => {
    expect(combinations([])).toEqual([[]]);
  });
});

describe("parseNairaInput", () => {
  it("parses whole naira to kobo", () => {
    expect(parseNairaInput("12,000")).toBe(1200000);
    expect(parseNairaInput("₦12,000")).toBe(1200000);
    expect(parseNairaInput(" 12000 ")).toBe(1200000);
  });
  it("returns null for bad input", () => {
    expect(parseNairaInput("12.5k")).toBeNull();
    expect(parseNairaInput("")).toBeNull();
    expect(parseNairaInput("-5")).toBeNull();
  });
});

describe("productInputSchema", () => {
  it("accepts a product with options", () => {
    expect(productInputSchema.safeParse(validProduct()).success).toBe(true);
  });

  it("accepts a no-option product with one default variant", () => {
    const input = {
      name: "Bag",
      imageIds: [IMG_1],
      options: [],
      variants: [
        { optionValues: [], priceKobo: 500000, stock: null, imageId: null, isEnabled: true },
      ],
    };
    expect(productInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects 0 images and 5 images", () => {
    const none = { ...validProduct(), imageIds: [] };
    expect(productInputSchema.safeParse(none).success).toBe(false);
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ];
    const five = { ...validProduct(), imageIds: ids };
    expect(productInputSchema.safeParse(five).success).toBe(false);
  });

  it("rejects a duplicate combination", () => {
    const input = validProduct();
    changeVariant(input, 1, { optionValues: ["S"] });
    expect(productInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects a variant missing a value", () => {
    const input = validProduct();
    changeVariant(input, 1, { optionValues: [] });
    expect(productInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects a value that is not in its option", () => {
    const input = validProduct();
    changeVariant(input, 1, { optionValues: ["XL"] });
    expect(productInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects option names that differ only by case", () => {
    const input = validProduct();
    input.options = [
      { name: "Size", values: ["S"] },
      { name: "size", values: ["M"] },
    ];
    expect(productInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects a low price with a per-variant path", () => {
    const input = validProduct();
    changeVariant(input, 1, { priceKobo: 9999 });
    const result = productInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("variants.1.priceKobo");
    }
  });

  it("accepts the minimum price of 10000 kobo", () => {
    const input = validProduct();
    changeVariant(input, 1, { priceKobo: 10000 });
    expect(productInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects negative stock", () => {
    const input = validProduct();
    changeVariant(input, 0, { stock: -1 });
    expect(productInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects an imageId that is not in imageIds", () => {
    const input = validProduct();
    changeVariant(input, 0, { imageId: IMG_2 });
    expect(productInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects when every variant is disabled", () => {
    const input = validProduct();
    changeVariant(input, 0, { isEnabled: false });
    changeVariant(input, 1, { isEnabled: false });
    const result = productInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain("Switch on at least one option");
    }
  });
});
