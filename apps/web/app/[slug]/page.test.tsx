import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { storefront: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

import { api } from "@/lib/api";
import StorefrontPage from "./page";

function props() {
  return {
    params: Promise.resolve({ slug: "mama-ngozi" }),
    searchParams: Promise.resolve({}),
  } as never;
}

describe("storefront page", () => {
  it("tells customers the shop is still setting up when it has no products", async () => {
    vi.mocked(api.storefront).mockResolvedValue({
      store: { slug: "mama-ngozi", businessName: "Mama Ngozi Styles" },
      products: [],
    } as never);
    render(await StorefrontPage(props()));
    expect(
      screen.getByRole("heading", { name: "This shop is still setting up" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Check back soon, or message the seller on WhatsApp."),
    ).toBeInTheDocument();
  });

  it("suspended shop shows the notice and no products", async () => {
    vi.mocked(api.storefront).mockResolvedValue({
      store: { slug: "mama-ngozi", businessName: "Mama Ngozi Styles", suspended: true },
      products: [],
    } as never);
    render(await StorefrontPage(props()));
    expect(
      screen.getByRole("heading", { name: "This shop isn't taking orders right now" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "This shop is still setting up" })).toBeNull();
  });

  it("'Powered by Gbam' links to Gbam, tagged with this shop, so sellers who click can be counted", async () => {
    vi.mocked(api.storefront).mockResolvedValue({
      store: { slug: "mama-ngozi", businessName: "Mama Ngozi Styles" },
      products: [],
    } as never);
    render(await StorefrontPage(props()));
    expect(screen.getByRole("link", { name: "Gbam." })).toHaveAttribute(
      "href",
      "/?ref=shop-mama-ngozi",
    );
  });

  it("a brand-new shop (no products, no bank yet) shows only 'still setting up'", async () => {
    vi.mocked(api.storefront).mockResolvedValue({
      store: {
        slug: "hedgeon",
        businessName: "Hedgeon Finance",
        suspended: false,
        acceptingOrders: false,
      },
      products: [],
    } as never);
    render(await StorefrontPage(props()));
    expect(
      screen.getByRole("heading", { name: "This shop is still setting up" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "This shop isn't taking orders yet" })).toBeNull();
  });

  it("a shop with no bank account yet shows its products and says it can't take orders", async () => {
    vi.mocked(api.storefront).mockResolvedValue({
      store: {
        slug: "mama-ngozi",
        businessName: "Mama Ngozi Styles",
        suspended: false,
        acceptingOrders: false,
      },
      products: [
        {
          slug: "ankara-dress",
          name: "Ankara dress",
          minPriceKobo: 1_500_000,
          maxPriceKobo: 1_500_000,
          photoUrl: null,
          soldOut: false,
        },
      ],
    } as never);
    render(await StorefrontPage(props()));
    expect(
      screen.getByRole("heading", { name: "This shop isn't taking orders yet" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ankara dress" })).toBeInTheDocument();
  });
});
