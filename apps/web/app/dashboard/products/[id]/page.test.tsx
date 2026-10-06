import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { getProduct: vi.fn(), currentUser: vi.fn() },
  ApiError: class ApiError extends Error {},
}));
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, useRouter: () => ({ refresh: vi.fn() }) };
});
vi.mock("../actions", () => ({ setProductStatusAction: vi.fn().mockResolvedValue({}) }));
vi.mock("../../tours/actions", () => ({
  saveTourStepAction: vi.fn(),
  finishTourAction: vi.fn(),
}));

import { api } from "@/lib/api";
import ProductDetailsPage from "./page";

const DRESS = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "ankara-wrap-dress",
  name: "Ankara wrap dress",
  description: "Fully lined, made to order.",
  status: "active",
  version: 3,
  images: [
    {
      id: "img-1",
      position: 1,
      largeUrl: "https://cdn/1-l.webp",
      smallUrl: "https://cdn/1-s.webp",
    },
    {
      id: "img-2",
      position: 2,
      largeUrl: "https://cdn/2-l.webp",
      smallUrl: "https://cdn/2-s.webp",
    },
  ],
  options: [
    { name: "Size", values: ["M", "L"] },
    { name: "Colour", values: ["Red"] },
  ],
  variants: [
    {
      id: "v1",
      optionValues: ["M", "Red"],
      title: "M / Red",
      priceKobo: 1200000,
      stock: 4,
      imageId: "img-2",
      isEnabled: true,
    },
    {
      id: "v2",
      optionValues: ["L", "Red"],
      title: "L / Red",
      priceKobo: 1500000,
      stock: 0,
      imageId: null,
      isEnabled: true,
    },
  ],
};

function props() {
  return { params: Promise.resolve({ id: DRESS.id }) } as never;
}

describe("product details page", () => {
  beforeEach(() => {
    vi.mocked(api.getProduct).mockResolvedValue(DRESS as never);
    vi.mocked(api.currentUser).mockResolvedValue({ seller: { slug: "mama-ngozi" } } as never);
  });

  it("shows the product, its price range, status and a summary of what's on sale", async () => {
    render(await ProductDetailsPage(props()));
    expect(
      screen.getByRole("heading", { name: "Ankara wrap dress", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("₦12,000 – ₦15,000")).toBeInTheDocument();
    expect(screen.getByText("Showing")).toBeInTheDocument();
    expect(screen.getByText("Fully lined, made to order.")).toBeInTheDocument();
    expect(
      screen.getByText("2 combinations · 1 on sale · 1 sold out · 4 in stock in total"),
    ).toBeInTheDocument();
  });

  it("lists every combination with its price and stock", async () => {
    render(await ProductDetailsPage(props()));
    const rows = screen.getAllByRole("row");
    const medium = rows.find((row) => row.textContent?.includes("M / Red"));
    const large = rows.find((row) => row.textContent?.includes("L / Red"));
    if (!medium || !large) {
      throw new Error("variant rows missing");
    }
    expect(within(medium).getByText("₦12,000")).toBeInTheDocument();
    expect(within(medium).getByText("4 left")).toBeInTheDocument();
    expect(within(large).getByText("Sold out")).toBeInTheDocument();
    expect(screen.getByText("Size")).toBeInTheDocument();
  });

  it("links to edit, to the product in the shop, and offers the product link to copy", async () => {
    render(await ProductDetailsPage(props()));
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/dashboard/products/${DRESS.id}/edit`,
    );
    const inShop = screen.getByRole("link", { name: /View in shop/ });
    expect(inShop).toHaveAttribute("href", "https://gbam.app/mama-ngozi/ankara-wrap-dress");
    expect(inShop).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("button", { name: "Copy product link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide from shop" })).toBeInTheDocument();
  });

  it("shows a single price and stock for a product without options", async () => {
    vi.mocked(api.getProduct).mockResolvedValue({
      ...DRESS,
      status: "hidden",
      options: [],
      variants: [{ ...DRESS.variants[0], optionValues: [], title: "", stock: null }],
    } as never);
    render(await ProductDetailsPage(props()));
    expect(screen.getByText("Hidden")).toBeInTheDocument();
    expect(screen.getByText("Not tracked")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("button", { name: "Show in shop" })).toBeInTheDocument();
  });
});
