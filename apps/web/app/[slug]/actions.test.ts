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
  return { api: { storefrontProduct: vi.fn(), placeOrder: vi.fn() }, ApiError };
});

import { api, ApiError } from "@/lib/api";
import { checkBasketAction, placeOrder } from "./actions";

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

describe("placeOrder delivery", () => {
  function orderForm(fields: Record<string, string>): FormData {
    const data = new FormData();
    data.set("name", "Ada");
    data.set("phone", "08031234567");
    data.set(
      "items",
      JSON.stringify([{ variantId: "11111111-1111-4111-8111-111111111111", quantity: 1 }]),
    );
    for (const [name, value] of Object.entries(fields)) {
      data.set(name, value);
    }
    return data;
  }

  beforeEach(() => {
    vi.mocked(api.placeOrder).mockReset();
  });

  it("sends zone id and expected fee", async () => {
    vi.mocked(api.placeOrder).mockResolvedValue({
      code: "GB-7K2Q",
      totalKobo: 650000,
      trackingKey: "k",
    } as never);
    const zoneId = "22222222-2222-4222-8222-222222222222";
    const state = await placeOrder(
      "ada",
      { status: "idle" },
      orderForm({ zoneId, expectedFeeKobo: "250000", address: "12 Admiralty Way", landmark: "" }),
    );
    expect(state.status).toBe("success");
    expect(vi.mocked(api.placeOrder).mock.calls[0]?.[1]).toMatchObject({
      delivery: { zoneId, expectedFeeKobo: 250000, address: "12 Admiralty Way", landmark: null },
    });
  });

  it("puts a delivery 409 on the delivery field", async () => {
    vi.mocked(api.placeOrder).mockRejectedValue(
      new ApiError(409, {
        field: "delivery",
        message: "Delivery to Lekki is now ₦3,000. Please check and confirm.",
      }),
    );
    const state = await placeOrder(
      "ada",
      { status: "idle" },
      orderForm({
        zoneId: "22222222-2222-4222-8222-222222222222",
        expectedFeeKobo: "250000",
        address: "12 Admiralty Way",
      }),
    );
    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.fieldErrors?.delivery).toEqual([
        "Delivery to Lekki is now ₦3,000. Please check and confirm.",
      ]);
      expect(state.values.zoneId).toBe("22222222-2222-4222-8222-222222222222");
      expect(state.values.address).toBe("12 Admiralty Way");
    }
  });
});
