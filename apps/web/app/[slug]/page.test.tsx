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
});
