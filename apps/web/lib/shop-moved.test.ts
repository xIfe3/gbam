import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { FakeApiError } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      super("api");
    }
  }
  return { FakeApiError };
});
vi.mock("./api", () => ({ ApiError: FakeApiError }));
vi.mock("next/navigation", () => ({
  permanentRedirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { redirectIfShopMoved } from "./shop-moved";

describe("a shop's old link", () => {
  it("redirects to the shop's new link, keeping the rest of the address", () => {
    const moved = new FakeApiError(404, { code: "SHOP_MOVED", slug: "ada-cakes" });
    expect(() => redirectIfShopMoved(moved, (slug) => `/${slug}/jollof`)).toThrow(
      "NEXT_REDIRECT:/ada-cakes/jollof",
    );
  });

  it("does nothing for any other error", () => {
    expect(() =>
      redirectIfShopMoved(new FakeApiError(404, {}), (slug) => `/${slug}`),
    ).not.toThrow();
    expect(() =>
      redirectIfShopMoved(
        new FakeApiError(404, { code: "SHOP_MOVED", slug: "../x" }),
        (slug) => `/${slug}`,
      ),
    ).not.toThrow();
  });
});
