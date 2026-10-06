import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EditorVariant } from "./editor-state";
import { VariantCards } from "./variant-cards";

function variant(values: string[], overrides: Partial<EditorVariant> = {}): EditorVariant {
  return {
    optionValues: values,
    priceText: "12,000",
    stockText: "10",
    imageId: null,
    isEnabled: true,
    ...overrides,
  };
}

const IMAGES = [
  { id: "img-1", smallUrl: "/1.webp" },
  { id: "img-2", smallUrl: "/2.webp" },
];

function setup(variants: EditorVariant[]) {
  const onChange = vi.fn();
  render(<VariantCards variants={variants} images={IMAGES} errors={{}} onChange={onChange} />);
  return onChange;
}

describe("VariantCards (the prices and stock table)", () => {
  it("is one compact table row per combination, with the stock hint said once", () => {
    setup([variant(["S", "Red"]), variant(["M", "Red"])]);
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2 rows
    expect(screen.getByRole("columnheader", { name: "Combination" })).toBeInTheDocument();
    expect(screen.getAllByText(/Leave stock blank/)).toHaveLength(1);
    // Each cell still has a full name for screen readers.
    expect(screen.getByLabelText("Price for S / Red")).toHaveValue("12,000");
    expect(screen.getByLabelText("Stock for M / Red")).toHaveValue("10");
  });

  it("shows prices with a ₦ sign and no fake-looking placeholder", () => {
    setup([variant(["S"], { priceText: "" })]);
    const price = screen.getByLabelText("Price for S");
    expect(price).not.toHaveAttribute("placeholder");
    const row = screen.getAllByRole("row")[1];
    if (!row) {
      throw new Error("row missing");
    }
    expect(within(row).getByText("₦")).toBeInTheDocument();
  });

  it("says Selling / Not selling and greys out a switched-off row", () => {
    const onChange = setup([variant(["S"]), variant(["M"], { isEnabled: false })]);
    expect(screen.getByRole("switch", { name: "Sell S" })).toHaveTextContent("Selling");
    const off = screen.getByRole("switch", { name: "Sell M" });
    expect(off).toHaveTextContent("Not selling");
    expect(off.closest("tr")).toHaveClass("opacity-60");

    fireEvent.click(screen.getByRole("switch", { name: "Sell S" }));
    const sent = onChange.mock.calls[0]?.[0] as EditorVariant[];
    expect(sent[0]?.isEnabled).toBe(false);
  });

  it("applies the same price and stock to every combination with one button", () => {
    const onChange = setup([variant(["S"], { priceText: "" }), variant(["M"], { priceText: "" })]);
    fireEvent.change(screen.getByLabelText("Same price for all"), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText("Same stock for all"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply to all" }));
    const sent = onChange.mock.calls[0]?.[0] as EditorVariant[];
    expect(sent.map((v) => [v.priceText, v.stockText])).toEqual([
      ["5000", "3"],
      ["5000", "3"],
    ]);
  });

  it("leaves stock alone when only the price box is filled", () => {
    const onChange = setup([variant(["S"], { stockText: "7" })]);
    fireEvent.change(screen.getByLabelText("Same price for all"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply to all" }));
    const sent = onChange.mock.calls[0]?.[0] as EditorVariant[];
    expect(sent[0]?.stockText).toBe("7");
  });

  it("picks a combination's photo from one small menu", () => {
    const onChange = setup([variant(["S"])]);
    const menu = screen.getByText("Photo: Main");
    fireEvent.click(menu);
    fireEvent.click(screen.getByRole("button", { name: "Use photo 2 for S" }));
    const sent = onChange.mock.calls[0]?.[0] as EditorVariant[];
    expect(sent[0]?.imageId).toBe("img-2");
  });
});
