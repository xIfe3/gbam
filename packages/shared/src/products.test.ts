import { describe, expect, it } from "vitest";
import {
  type ProductInput,
  combinations,
  parseNairaInput,
  productInputSchema,
  productSlugBase,
  updateProductInputSchema,
  variantTitle,
} from "./products";

const IMG_1 = "11111111-1111-4111-8111-111111111111";
const IMG_2 = "22222222-2222-4222-8222-222222222222";

type Variant = ProductInput["variants"][number];

// Replaces some fields of one variant.
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

function issuesOf(input: unknown) {
  const result = productInputSchema.safeParse(input);
  if (result.success) {
    throw new Error("Expected the product to be rejected");
  }
  const found: { path: string; message: string }[] = [];
  for (const issue of result.error.issues) {
    found.push({ path: issue.path.join("."), message: issue.message });
  }
  return found;
}

// Checks that some issue sits at `path` (and has `message`, when given), so a test
// can't pass because the input failed for an unrelated reason.
function expectIssueAt(input: unknown, path: string, message?: string) {
  const issues = issuesOf(input);
  let match = false;
  for (const issue of issues) {
    if (issue.path === path) {
      if (message === undefined || issue.message === message) {
        match = true;
      }
    }
  }
  expect(match, "issues were " + JSON.stringify(issues)).toBe(true);
}

function uuid(n: number) {
  const d = String(n);
  return (
    d.repeat(8) + "-" + d.repeat(4) + "-4" + d.repeat(3) + "-8" + d.repeat(3) + "-" + d.repeat(12)
  );
}

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

  it("rejects 0 images", () => {
    expectIssueAt({ ...validProduct(), imageIds: [] }, "imageIds");
  });

  it("rejects 5 images", () => {
    const ids = [uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)];
    expectIssueAt({ ...validProduct(), imageIds: ids }, "imageIds");
  });

  it("rejects duplicate imageIds", () => {
    const input = { ...validProduct(), imageIds: [IMG_1, IMG_1] };
    expectIssueAt(input, "imageIds", "Each photo can only be used once");
  });

  it("rejects a duplicate combination", () => {
    const input = validProduct();
    changeVariant(input, 1, { optionValues: ["S"] });
    expectIssueAt(input, "variants.1.optionValues", "Two options have the same combination");
  });

  it("rejects a variant missing a value, with one issue only", () => {
    const input = validProduct();
    changeVariant(input, 1, { optionValues: [] });
    expectIssueAt(input, "variants.1.optionValues", "Pick one value for every option");
    expect(issuesOf(input)).toHaveLength(1);
  });

  it("rejects a value that is not in its option, with one issue only", () => {
    const input = validProduct();
    changeVariant(input, 1, { optionValues: ["XL"] });
    expectIssueAt(
      input,
      "variants.1.optionValues.0",
      "That value is not one of the option's values",
    );
    expect(issuesOf(input)).toHaveLength(1);
  });

  it("rejects option names that differ only by case", () => {
    const input = validProduct();
    input.options = [
      { name: "Size", values: ["S"] },
      { name: "size", values: ["M"] },
    ];
    expectIssueAt(input, "options.1.name", "Option names must be different");
  });

  it("rejects duplicate values in an option", () => {
    const input = validProduct();
    input.options = [{ name: "Size", values: ["S", "S"] }];
    expectIssueAt(input, "options.0.values", "Each value must be different");
  });

  it("rejects no options with two variants", () => {
    const input = validProduct();
    input.options = [];
    changeVariant(input, 0, { optionValues: [] });
    changeVariant(input, 1, { optionValues: [] });
    expectIssueAt(input, "variants", "A product with no options has exactly one variant");
  });

  it("rejects 4 options", () => {
    const input = validProduct();
    input.options = [
      { name: "A", values: ["1"] },
      { name: "B", values: ["1"] },
      { name: "C", values: ["1"] },
      { name: "D", values: ["1"] },
    ];
    expectIssueAt(input, "options");
  });

  it("rejects 21 values in an option", () => {
    const input = validProduct();
    const values: string[] = [];
    for (let i = 0; i < 21; i++) {
      values.push("v" + i);
    }
    input.options = [{ name: "Size", values: values }];
    expectIssueAt(input, "options.0.values");
  });

  it("rejects 51 variants", () => {
    const input = validProduct();
    input.options = [];
    input.variants = [];
    for (let i = 0; i < 51; i++) {
      input.variants.push({
        optionValues: [],
        priceKobo: 10000,
        stock: null,
        imageId: null,
        isEnabled: true,
      });
    }
    expectIssueAt(input, "variants");
  });

  it("rejects a price of 9999 with a per-variant path", () => {
    const input = validProduct();
    changeVariant(input, 1, { priceKobo: 9999 });
    expectIssueAt(input, "variants.1.priceKobo", "Minimum price is ₦100");
  });

  it("accepts the minimum price of 10000 kobo", () => {
    const input = validProduct();
    changeVariant(input, 1, { priceKobo: 10000 });
    expect(productInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects a price above the database limit", () => {
    const input = validProduct();
    changeVariant(input, 0, { priceKobo: 2_000_000_001 });
    expectIssueAt(input, "variants.0.priceKobo", "That price is too high");
  });

  it("rejects negative stock", () => {
    const input = validProduct();
    changeVariant(input, 0, { stock: -1 });
    expectIssueAt(input, "variants.0.stock");
  });

  it("rejects stock above the limit", () => {
    const input = validProduct();
    changeVariant(input, 0, { stock: 1_000_001 });
    expectIssueAt(input, "variants.0.stock", "That stock is too high");
  });

  it("rejects an imageId that is not in imageIds", () => {
    const input = validProduct();
    changeVariant(input, 0, { imageId: IMG_2 });
    expectIssueAt(input, "variants.0.imageId", "Choose one of this product's photos");
  });

  it("rejects when every variant is disabled", () => {
    const input = validProduct();
    changeVariant(input, 0, { isEnabled: false });
    changeVariant(input, 1, { isEnabled: false });
    expectIssueAt(input, "variants", "Switch on at least one option");
  });
});

describe("updateProductInputSchema", () => {
  it("accepts a product with a version and keeps both", () => {
    const result = updateProductInputSchema.safeParse({ ...validProduct(), version: 3 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(3);
      expect(result.data.name).toBe("Ankara Dress");
      expect(result.data.variants).toHaveLength(2);
    }
  });

  it("rejects a missing version", () => {
    const result = updateProductInputSchema.safeParse(validProduct());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["version"]);
    }
  });

  it("rejects a version of 0", () => {
    const result = updateProductInputSchema.safeParse({ ...validProduct(), version: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["version"]);
    }
  });

  it("still applies the product rules", () => {
    const input = validProduct();
    changeVariant(input, 0, { isEnabled: false });
    changeVariant(input, 1, { isEnabled: false });
    const result = updateProductInputSchema.safeParse({ ...input, version: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages: string[] = [];
      for (const issue of result.error.issues) {
        messages.push(issue.message);
      }
      expect(messages).toContain("Switch on at least one option");
    }
  });
});
