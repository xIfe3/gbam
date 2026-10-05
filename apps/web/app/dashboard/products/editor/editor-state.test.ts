import { describe, expect, it } from "vitest";
import {
  rebuildVariants,
  setAllPrices,
  setAllStock,
  toProductInput,
  withHasOptions,
  withOptions,
  type EditorState,
  type EditorVariant,
} from "./editor-state";

const IMG = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function variant(values: string[], changes: Partial<EditorVariant> = {}): EditorVariant {
  return {
    optionValues: values,
    priceText: "",
    stockText: "",
    imageId: null,
    isEnabled: true,
    ...changes,
  };
}

describe("rebuildVariants", () => {
  it("keeps price, stock, image and id when a value is renamed", () => {
    const previous = [
      variant(["S"], { id: "id-s", priceText: "1000", stockText: "3", imageId: IMG }),
      variant(["M"], { id: VARIANT_ID, priceText: "12,000", stockText: "5", imageId: IMG }),
    ];
    const oldOptions = [{ name: "Size", values: ["S", "M"] }];
    const newOptions = [{ name: "Size", values: ["S", "Medium"] }];

    const result = rebuildVariants(previous, oldOptions, newOptions);

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      id: VARIANT_ID,
      optionValues: ["Medium"],
      priceText: "12,000",
      stockText: "5",
      imageId: IMG,
      isEnabled: true,
    });
    expect(result[0]?.id).toBe("id-s");
  });

  it("adds blank variants for a new value and keeps the rest", () => {
    const previous = [variant(["S"], { priceText: "1000" }), variant(["M"], { priceText: "2000" })];
    const oldOptions = [{ name: "Size", values: ["S", "M"] }];
    const newOptions = [{ name: "Size", values: ["S", "M", "L"] }];

    const result = rebuildVariants(previous, oldOptions, newOptions);

    expect(result.map((v) => v.optionValues)).toEqual([["S"], ["M"], ["L"]]);
    expect(result[0]?.priceText).toBe("1000");
    expect(result[1]?.priceText).toBe("2000");
    expect(result[2]).toEqual(variant(["L"]));
  });

  it("keeps values by name when one is added in the middle", () => {
    const previous = [variant(["S"], { priceText: "1000" }), variant(["L"], { priceText: "3000" })];
    const oldOptions = [{ name: "Size", values: ["S", "L"] }];
    const newOptions = [{ name: "Size", values: ["S", "M", "L"] }];

    const result = rebuildVariants(previous, oldOptions, newOptions);

    expect(result[0]?.priceText).toBe("1000");
    expect(result[1]?.priceText).toBe("");
    expect(result[2]?.priceText).toBe("3000");
  });

  it("merges when an option is removed, keeping the first matching variant", () => {
    const oldOptions = [
      { name: "Size", values: ["S", "M"] },
      { name: "Colour", values: ["Red", "Blue"] },
    ];
    const previous = [
      variant(["S", "Red"], { id: "a", priceText: "1000" }),
      variant(["S", "Blue"], { id: "b", priceText: "1100" }),
      variant(["M", "Red"], { id: "c", priceText: "2000" }),
      variant(["M", "Blue"], { id: "d", priceText: "2100" }),
    ];
    const newOptions = [{ name: "Size", values: ["S", "M"] }];

    const result = rebuildVariants(previous, oldOptions, newOptions);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("a");
    expect(result[0]?.priceText).toBe("1000");
    expect(result[1]?.id).toBe("c");
    expect(result[1]?.priceText).toBe("2000");
  });

  it("carries a no-option variant over to the first combination of a new option", () => {
    const previous = [variant([], { id: "only", priceText: "5000", stockText: "2" })];
    const result = rebuildVariants(previous, [], [{ name: "Size", values: ["S", "M"] }]);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("only");
    expect(result[0]?.priceText).toBe("5000");
    // The same variant id is never used twice.
    expect(result[1]?.id).toBeUndefined();
  });
});

describe("setAllPrices and setAllStock", () => {
  it("set the same text on every variant without changing the original", () => {
    const original = [variant(["S"]), variant(["M"])];
    const priced = setAllPrices(original, "9,000");
    const stocked = setAllStock(priced, "4");
    expect(stocked.map((v) => v.priceText)).toEqual(["9,000", "9,000"]);
    expect(stocked.map((v) => v.stockText)).toEqual(["4", "4"]);
    expect(original[0]?.priceText).toBe("");
  });
});

function validState(): EditorState {
  return {
    name: "Ankara Dress",
    description: "",
    images: [{ id: IMG, smallUrl: "/s.webp" }],
    hasOptions: true,
    options: [{ name: "Size", values: ["S", "M"] }],
    variants: [
      variant(["S"], { priceText: "₦12,000", stockText: "" }),
      variant(["M"], { priceText: "13000", stockText: "5" }),
    ],
  };
}

describe("toProductInput", () => {
  it("turns ₦12,000 into kobo and a blank stock into null", () => {
    const result = toProductInput(validState());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.imageIds).toEqual([IMG]);
      expect(result.input.variants[0]?.priceKobo).toBe(1200000);
      expect(result.input.variants[0]?.stock).toBeNull();
      expect(result.input.variants[1]?.stock).toBe(5);
      expect(result.input.description).toBeUndefined();
    }
  });

  it("reports variants.1.price for a price that is not a number", () => {
    const state = validState();
    state.variants[1] = variant(["M"], { priceText: "abc" });
    const result = toProductInput(state);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors["variants.1.price"]).toBeTruthy();
    }
  });

  it("reports the schema's errors on friendly keys", () => {
    const state = validState();
    state.name = "  ";
    state.images = [];
    state.variants[0] = variant(["S"], { priceText: "50" });
    const result = toProductInput(state);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors["name"]).toBeTruthy();
      expect(result.errors["images"]).toBeTruthy();
      expect(result.errors["variants.0.price"]).toBe("Minimum price is ₦100");
    }
  });

  it("builds a single default variant for a product with no options", () => {
    const state = validState();
    state.hasOptions = false;
    state.options = [];
    state.variants = [variant([], { id: VARIANT_ID, priceText: "5000" })];
    const result = toProductInput(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.options).toEqual([]);
      expect(result.input.variants).toHaveLength(1);
      expect(result.input.variants[0]?.id).toBe(VARIANT_ID);
    }
  });
});

function singleVariantState(): EditorState {
  return {
    name: "Bag",
    description: "",
    images: [{ id: IMG, smallUrl: "/s.webp" }],
    hasOptions: false,
    options: [],
    variants: [variant([], { id: VARIANT_ID, priceText: "5000", stockText: "7", imageId: IMG })],
  };
}

describe("switching options on and off", () => {
  it("No, then Yes, then No keeps the original variant's id, price and stock", () => {
    const yes = withHasOptions(singleVariantState(), true);
    expect(yes.hasOptions).toBe(true);
    expect(yes.variants).toEqual([]);

    const no = withHasOptions(yes, false);
    expect(no.variants).toHaveLength(1);
    expect(no.variants[0]?.id).toBe(VARIANT_ID);
    expect(no.variants[0]?.priceText).toBe("5000");
    expect(no.variants[0]?.stockText).toBe("7");
    expect(no.options).toEqual([]);
  });

  it("gives the first value added the stashed variant's id, price, stock and image", () => {
    const yes = withHasOptions(singleVariantState(), true);
    const withName = withOptions(yes, [{ name: "Size", values: [] }]);
    const withS = withOptions(withName, [{ name: "Size", values: ["S"] }]);

    expect(withS.variants).toHaveLength(1);
    expect(withS.variants[0]).toEqual({
      id: VARIANT_ID,
      optionValues: ["S"],
      priceText: "5000",
      stockText: "7",
      imageId: IMG,
      isEnabled: true,
    });
    expect(withS.stash).toBeUndefined();
  });

  it("keeps ids when the last value is deleted and added again", () => {
    const start: EditorState = {
      ...singleVariantState(),
      hasOptions: true,
      options: [{ name: "Size", values: ["S"] }],
      variants: [variant(["S"], { id: VARIANT_ID, priceText: "5000" })],
    };
    const emptied = withOptions(start, [{ name: "Size", values: [] }]);
    expect(emptied.variants).toEqual([]);

    const back = withOptions(emptied, [{ name: "Size", values: ["S"] }]);
    expect(back.variants[0]?.id).toBe(VARIANT_ID);
    expect(back.variants[0]?.priceText).toBe("5000");
  });
});
