import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: { listProducts: vi.fn() } }));

import { api } from "@/lib/api";
import ProductsPage from "./page";

function item(overrides: Record<string, unknown>) {
  return {
    id: "p1",
    slug: "dress",
    name: "Ankara wrap dress",
    status: "active",
    mainPhotoUrl: "https://cdn/dress-small.webp",
    minPriceKobo: 1200000,
    maxPriceKobo: 1500000,
    variantCount: 3,
    totalStock: 12,
    ...overrides,
  };
}

function props(show?: string) {
  const searchParams: Record<string, string> = {};
  if (show) {
    searchParams.show = show;
  }
  return { searchParams: Promise.resolve(searchParams) } as never;
}

describe("products page", () => {
  beforeEach(() => {
    vi.mocked(api.listProducts).mockReset();
  });

  it("shows price range, stock text and the Showing pill", async () => {
    vi.mocked(api.listProducts).mockResolvedValue([item({})] as never);
    render(await ProductsPage(props()));
    expect(screen.getByText("Ankara wrap dress")).toBeInTheDocument();
    expect(screen.getByText("₦12,000 – ₦15,000")).toBeInTheDocument();
    expect(screen.getByText("3 variants · 12 left")).toBeInTheDocument();
    // "Showing" is also a filter tab, so look for the pill inside the row link.
    const row = screen.getByRole("link", { name: /Ankara wrap dress/ });
    expect(row).toHaveTextContent("Showing");
    expect(row).toHaveAttribute("href", "/dashboard/products/p1");
  });

  it("shows a single price, Not tracked and a Hidden pill", async () => {
    vi.mocked(api.listProducts).mockResolvedValue([
      item({
        status: "hidden",
        minPriceKobo: 500000,
        maxPriceKobo: 500000,
        variantCount: 1,
        totalStock: null,
        mainPhotoUrl: null,
      }),
    ] as never);
    render(await ProductsPage(props()));
    expect(screen.getByText("₦5,000")).toBeInTheDocument();
    expect(screen.getByText("1 variant · Not tracked")).toBeInTheDocument();
    // "Hidden" is also a filter tab, so look for the pill inside the row link.
    const row = screen.getByRole("link", { name: /Ankara wrap dress/ });
    expect(row).toHaveTextContent("Hidden");
  });

  it("shows Low stock when tracked stock is 5 or fewer", async () => {
    vi.mocked(api.listProducts).mockResolvedValue([item({ totalStock: 5 })] as never);
    render(await ProductsPage(props()));
    expect(screen.getByText("Low stock")).toBeInTheDocument();
  });

  it("says no options are switched on instead of a zero price", async () => {
    vi.mocked(api.listProducts).mockResolvedValue([
      item({ variantCount: 0, minPriceKobo: 0, maxPriceKobo: 0, totalStock: null }),
    ] as never);
    render(await ProductsPage(props()));
    expect(screen.getByText("No options switched on")).toBeInTheDocument();
    expect(screen.queryByText("₦0")).not.toBeInTheDocument();
  });

  it("lists only hidden products for ?show=hidden", async () => {
    vi.mocked(api.listProducts).mockResolvedValue([
      item({ id: "a", name: "Visible one" }),
      item({ id: "b", name: "Hidden one", status: "hidden" }),
    ] as never);
    render(await ProductsPage(props("hidden")));
    expect(screen.getByText("Hidden one")).toBeInTheDocument();
    expect(screen.queryByText("Visible one")).not.toBeInTheDocument();
  });

  it("shows the empty state with an add button", async () => {
    vi.mocked(api.listProducts).mockResolvedValue([]);
    render(await ProductsPage(props()));
    expect(screen.getByText("No products yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your first product" })).toHaveAttribute(
      "href",
      "/dashboard/products/new",
    );
  });
});
