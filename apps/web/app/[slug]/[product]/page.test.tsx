import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(readonly status: number) {
      super("api error");
    }
  }
  return { api: { storefrontProduct: vi.fn() }, ApiError };
});

import { api, ApiError } from "@/lib/api";
import ProductPage, { generateMetadata } from "./page";

const PAGE = {
  store: { slug: "ada", businessName: "Ada Bakes" },
  product: {
    slug: "cake",
    name: "Cake",
    description: "Moist.",
    images: [
      {
        id: "i1",
        largeUrl: "https://cdn/cake-large.webp",
        smallUrl: "https://cdn/cake-small.webp",
      },
    ],
    options: [],
    variants: [
      { id: "v1", optionValues: [], title: "Cake", priceKobo: 500000, stock: null, imageId: null },
    ],
  },
};

const props = { params: Promise.resolve({ slug: "ada", product: "cake" }) } as never;

describe("product page", () => {
  beforeEach(() => {
    vi.mocked(api.storefrontProduct).mockReset();
  });

  it("calls notFound for an unknown product", async () => {
    vi.mocked(api.storefrontProduct).mockRejectedValue(new ApiError(404, null));
    await expect(ProductPage(props)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("puts the product photo and price in the metadata", async () => {
    vi.mocked(api.storefrontProduct).mockResolvedValue(PAGE);
    const meta = await generateMetadata(props);
    expect(meta.title).toBe("Cake · Ada Bakes");
    expect(meta.description).toContain("₦5,000");
    expect(meta.openGraph?.images).toEqual(["https://cdn/cake-large.webp"]);
  });

  it("renders the product name and description", async () => {
    vi.mocked(api.storefrontProduct).mockResolvedValue(PAGE);
    render(await ProductPage(props));
    expect(screen.getByRole("heading", { name: "Cake" })).toBeInTheDocument();
    expect(screen.getByText("Moist.")).toBeInTheDocument();
  });

  it("calls notFound for a reserved slug without asking the API", async () => {
    const reserved = { params: Promise.resolve({ slug: "login", product: "cake" }) } as never;
    await expect(ProductPage(reserved)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(api.storefrontProduct).not.toHaveBeenCalled();
  });

  it("rethrows an API error that is not a 404", async () => {
    vi.mocked(api.storefrontProduct).mockRejectedValue(new ApiError(500, null));
    await expect(ProductPage(props)).rejects.toThrow("api error");
  });

  it("repeats title and description in openGraph and omits a price with no variants", async () => {
    vi.mocked(api.storefrontProduct).mockResolvedValue({
      ...PAGE,
      product: { ...PAGE.product, variants: [] },
    });
    const meta = await generateMetadata(props);
    expect(meta.description).not.toContain("₦");
    expect(meta.openGraph?.title).toBe("Cake · Ada Bakes");
    expect(meta.openGraph?.description).toBe(meta.description);
  });
});
