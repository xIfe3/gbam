import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The real action talks to the API; the form only needs something to call.
vi.mock("./actions", () => ({ placeOrder: vi.fn() }));

import { Checkout } from "./checkout";

const products = [{ id: "p1", name: "Jollof Rice", description: null, priceKobo: 350000 }] as never;

describe("Checkout", () => {
  it("links to the terms and privacy policy near the order button", () => {
    render(<Checkout slug="mama" products={products} />);
    const terms = screen.getByRole("link", { name: /Terms/ });
    const privacy = screen.getByRole("link", { name: /Privacy/ });
    expect(terms).toHaveAttribute("href", "/legal/terms");
    expect(privacy).toHaveAttribute("href", "/legal/privacy");
  });

  it("opens the legal links in a new tab so the basket is not lost", () => {
    render(<Checkout slug="mama" products={products} />);
    const terms = screen.getByRole("link", { name: /Terms/ });
    const privacy = screen.getByRole("link", { name: /Privacy/ });
    for (const link of [terms, privacy]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveTextContent("(opens in a new tab)");
      // min-h-11 = 44px minimum tap height.
      expect(link).toHaveClass("min-h-11");
    }
  });

  it("keeps the order button disabled until an item is added, then shows the total", () => {
    render(<Checkout slug="mama" products={products} />);
    expect(screen.getByRole("button", { name: "Add items to order" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Add one Jollof Rice" }));
    const order = screen.getByRole("button", { name: /Place order/ });
    expect(order).toBeEnabled();
    expect(order).toHaveTextContent("3,500");
  });
});
