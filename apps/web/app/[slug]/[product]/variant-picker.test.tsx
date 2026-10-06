import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StorefrontProduct, StorefrontVariant } from "@/lib/api";
import { VariantPicker } from "./variant-picker";

const IMAGES = [
  { id: "img1", largeUrl: "https://cdn/1-large.webp", smallUrl: "https://cdn/1-small.webp" },
  { id: "img2", largeUrl: "https://cdn/2-large.webp", smallUrl: "https://cdn/2-small.webp" },
];

const TEE: StorefrontProduct = {
  slug: "tee",
  name: "Tee",
  description: null,
  images: IMAGES,
  options: [
    { name: "Size", values: ["S", "M"] },
    { name: "Colour", values: ["Red", "Blue"] },
  ],
  variants: [
    {
      id: "v1",
      optionValues: ["S", "Red"],
      title: "S / Red",
      priceKobo: 500000,
      stock: 10,
      imageId: null,
    },
    {
      id: "v2",
      optionValues: ["S", "Blue"],
      title: "S / Blue",
      priceKobo: 500000,
      stock: 0,
      imageId: null,
    },
    {
      id: "v3",
      optionValues: ["M", "Red"],
      title: "M / Red",
      priceKobo: 600000,
      stock: 3,
      imageId: "img2",
    },
    {
      id: "v4",
      optionValues: ["M", "Blue"],
      title: "M / Blue",
      priceKobo: 600000,
      stock: null,
      imageId: null,
    },
  ],
};

const MUG_VARIANT: StorefrontVariant = {
  id: "m1",
  optionValues: [],
  title: "Mug",
  priceKobo: 250000,
  stock: null,
  imageId: null,
};

const MUG: StorefrontProduct = {
  slug: "mug",
  name: "Mug",
  description: null,
  images: [],
  options: [],
  variants: [
    { id: "m1", optionValues: [], title: "Mug", priceKobo: 250000, stock: null, imageId: null },
  ],
};

describe("VariantPicker", () => {
  it("shows the chosen variant's price and linked photo", () => {
    render(<VariantPicker product={TEE} onAdd={vi.fn()} />);
    expect(screen.getByRole("img", { name: "Tee" })).toHaveAttribute("src", IMAGES[0]?.largeUrl);

    fireEvent.click(screen.getByRole("button", { name: "M" }));
    fireEvent.click(screen.getByRole("button", { name: "Red" }));

    expect(screen.getByText("₦6,000")).toBeInTheDocument();
    expect(screen.getByText("3 left")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Tee" })).toHaveAttribute("src", IMAGES[1]?.largeUrl);
  });

  it("disables a value whose combination is sold out", () => {
    render(<VariantPicker product={TEE} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "S" }));
    expect(screen.getByRole("button", { name: "Blue, sold out" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Red" })).toBeEnabled();
  });

  it("keeps Add to order disabled until every option is chosen", () => {
    const onAdd = vi.fn();
    render(<VariantPicker product={TEE} onAdd={onAdd} />);
    const add = screen.getByRole("button", { name: "Add to order" });
    expect(add).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    expect(add).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Red" }));
    expect(add).toBeEnabled();

    fireEvent.click(add);
    expect(onAdd).toHaveBeenCalledWith({
      variantId: "v3",
      productSlug: "tee",
      productName: "Tee",
      variantTitle: "M / Red",
      priceKobo: 600000,
      photoUrl: "https://cdn/2-small.webp",
      quantity: 1,
    });
  });

  it("enables Add to order at once for a product with no options", () => {
    render(<VariantPicker product={MUG} onAdd={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^(S|M)$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to order" })).toBeEnabled();
  });

  it("does not let the quantity go past tracked stock", () => {
    render(<VariantPicker product={TEE} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    fireEvent.click(screen.getByRole("button", { name: "Red" }));
    const more = screen.getByRole("button", { name: "More" });
    fireEvent.click(more);
    fireEvent.click(more);
    fireEvent.click(more);
    expect(screen.getByTestId("quantity")).toHaveTextContent("3");
    expect(more).toBeDisabled();
  });

  it("lets a tapped thumbnail override the variant photo", () => {
    render(<VariantPicker product={TEE} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    fireEvent.click(screen.getByRole("button", { name: "Red" }));
    expect(screen.getByRole("img", { name: "Tee" })).toHaveAttribute("src", IMAGES[1]?.largeUrl);
    fireEvent.click(screen.getByRole("button", { name: "Show photo 1" }));
    expect(screen.getByRole("img", { name: "Tee" })).toHaveAttribute("src", IMAGES[0]?.largeUrl);
  });

  it("shows N left at 5 but not at 6", () => {
    const five = { ...MUG, variants: [{ ...MUG_VARIANT, stock: 5 }] };
    const { unmount } = render(<VariantPicker product={five} onAdd={vi.fn()} />);
    expect(screen.getByText("5 left")).toBeInTheDocument();
    unmount();
    const six = { ...MUG, variants: [{ ...MUG_VARIANT, stock: 6 }] };
    render(<VariantPicker product={six} onAdd={vi.fn()} />);
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
  });

  it("caps the quantity at 99 when stock is not tracked", () => {
    render(<VariantPicker product={MUG} onAdd={vi.fn()} />);
    const more = screen.getByRole("button", { name: "More" });
    for (let i = 0; i < 120; i++) {
      if (!(more as HTMLButtonElement).disabled) {
        fireEvent.click(more);
      }
    }
    expect(screen.getByTestId("quantity")).toHaveTextContent("99");
    expect(more).toBeDisabled();
  });

  it("keeps Add to order disabled for a sold-out product with no options", () => {
    const soldOut = { ...MUG, variants: [{ ...MUG_VARIANT, stock: 0 }] };
    render(<VariantPicker product={soldOut} onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Add to order" })).toBeDisabled();
  });

  it("never blocks untracked stock, and labels sold-out values", () => {
    render(<VariantPicker product={TEE} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    expect(screen.getByRole("button", { name: "Blue" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "S" }));
    expect(screen.getByRole("button", { name: "Blue, sold out" })).toBeDisabled();
  });

  it("says plainly what to pick next, and what's chosen", () => {
    render(<VariantPicker product={TEE} onAdd={vi.fn()} />);
    expect(screen.getByText("Choose a Size")).toBeInTheDocument();
    expect(
      screen.getByText("Choose a Size and Colour to add it to your order."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "S" }));
    expect(screen.getByText("Choose a Colour to add it to your order.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Red" }));
    expect(screen.getByText("You picked: S / Red")).toBeInTheDocument();
  });

  it("confirms Add to order clearly, with a link to the order", async () => {
    vi.useFakeTimers();
    const onAdd = vi.fn();
    render(<VariantPicker product={MUG} onAdd={onAdd} orderHref="/ada/order" />);
    fireEvent.click(screen.getByRole("button", { name: "Add to order" }));
    expect(onAdd).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "✓ Added" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Added to your order.");
    expect(screen.getByRole("link", { name: "View your order →" })).toHaveAttribute(
      "href",
      "/ada/order",
    );
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByRole("button", { name: "Add to order" })).toBeInTheDocument();
    // The link stays, so they can still go and check out.
    expect(screen.getByRole("link", { name: "View your order →" })).toBeInTheDocument();
    vi.useRealTimers();
  });
});
