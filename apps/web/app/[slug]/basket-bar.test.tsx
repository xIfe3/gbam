import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { BasketBar } from "./basket-bar";

const LINES = [
  {
    variantId: "v1",
    productSlug: "slides",
    productName: "Leather slides",
    variantTitle: "42",
    priceKobo: 500000,
    photoUrl: null,
    quantity: 2,
  },
];

describe("BasketBar", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("gbam-basket:ada", JSON.stringify(LINES));
    localStorage.setItem("gbam-basket:other", JSON.stringify(LINES));
  });

  it("shows the item count, total and a link to the order page", () => {
    render(<BasketBar shopSlug="ada" />);
    expect(screen.getByText(/2 items/)).toHaveTextContent("10,000");
    expect(screen.getByRole("link", { name: "View basket" })).toHaveAttribute("href", "/ada/order");
  });

  it("clears only this shop's basket when the customer is back from paying", async () => {
    render(<BasketBar shopSlug="ada" clearOnMount />);
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "View basket" })).not.toBeInTheDocument();
    });
    const saved = localStorage.getItem("gbam-basket:ada");
    if (saved === null) {
      throw new Error("Expected the basket key to still exist");
    }
    expect(JSON.parse(saved)).toEqual([]);
    expect(localStorage.getItem("gbam-basket:other")).not.toBeNull();
  });
});
