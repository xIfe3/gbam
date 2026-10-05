import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      super("api error");
    }
  }
  return { api: { storefrontProduct: vi.fn() }, ApiError };
});

import { api, ApiError } from "@/lib/api";
import { checkBasketAction } from "./actions";

function pageFor(slug: string) {
  return {
    store: { slug: "ada", businessName: "Ada" },
    product: {
      slug,
      name: slug,
      description: null,
      images: [],
      options: [],
      variants: [],
    },
  };
}

describe("checkBasketAction", () => {
  beforeEach(() => {
    vi.mocked(api.storefrontProduct).mockReset();
  });

  it("fetches each product slug only once", async () => {
    vi.mocked(api.storefrontProduct).mockImplementation(async (_shop, slug) => pageFor(slug));
    const products = await checkBasketAction("ada", ["tee", "slides", "tee"]);
    expect(api.storefrontProduct).toHaveBeenCalledTimes(2);
    expect(products.map((product) => product.slug)).toEqual(["tee", "slides"]);
  });

  it("leaves out a product that returns 404 so it counts as gone", async () => {
    vi.mocked(api.storefrontProduct).mockImplementation(async (_shop, slug) => {
      if (slug === "deleted") {
        throw new ApiError(404, null);
      }
      return pageFor(slug);
    });
    const products = await checkBasketAction("ada", ["deleted", "tee"]);
    expect(products.map((product) => product.slug)).toEqual(["tee"]);
  });

  it("passes other errors on", async () => {
    vi.mocked(api.storefrontProduct).mockRejectedValue(new ApiError(500, null));
    await expect(checkBasketAction("ada", ["tee"])).rejects.toThrow();
  });

  it("rejects more than 50 product slugs without calling the API", async () => {
    const tooMany: string[] = [];
    for (let i = 0; i < 51; i++) {
      tooMany.push(`product-${i}`);
    }
    await expect(checkBasketAction("ada", tooMany)).rejects.toThrow("Invalid basket check request");
    expect(api.storefrontProduct).not.toHaveBeenCalled();
  });

  it("rejects values of the wrong type", async () => {
    await expect(checkBasketAction("ada", [42] as unknown as string[])).rejects.toThrow();
    await expect(checkBasketAction(7 as unknown as string, ["tee"])).rejects.toThrow();
    expect(api.storefrontProduct).not.toHaveBeenCalled();
  });
});
