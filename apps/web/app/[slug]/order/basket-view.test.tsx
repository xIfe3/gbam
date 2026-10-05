import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StorefrontProduct } from "@/lib/api";

// The real actions talk to the API; the view only needs something to call.
vi.mock("../actions", () => ({
  checkBasketAction: vi.fn(),
  placeOrder: vi.fn(),
}));

import { checkBasketAction, placeOrder } from "../actions";
import { BasketView } from "./basket-view";

const STORAGE_KEY = "gbam-basket:ada";

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
  {
    variantId: "v2",
    productSlug: "tee",
    productName: "Tee",
    variantTitle: "M",
    priceKobo: 300000,
    photoUrl: null,
    quantity: 1,
  },
];

function makeProduct(
  slug: string,
  name: string,
  id: string,
  title: string,
  price: number,
  stock: number | null,
): StorefrontProduct {
  return {
    slug,
    name,
    description: null,
    images: [],
    options: [],
    variants: [{ id, optionValues: [], title, priceKobo: price, stock, imageId: null }],
  };
}

const HEALTHY = [
  makeProduct("slides", "Leather slides", "v1", "42", 500000, 10),
  makeProduct("tee", "Tee", "v2", "M", 300000, null),
];
const SOLD_OUT = [
  makeProduct("slides", "Leather slides", "v1", "42", 500000, 0),
  makeProduct("tee", "Tee", "v2", "M", 300000, null),
];

describe("BasketView", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(LINES));
    vi.mocked(checkBasketAction).mockReset();
    vi.mocked(placeOrder).mockReset();
    vi.mocked(placeOrder).mockResolvedValue({ status: "idle" });
  });

  it("shows the lines from storage with the total", async () => {
    vi.mocked(checkBasketAction).mockResolvedValue(HEALTHY);
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" />);

    expect(await screen.findByText("Leather slides")).toBeInTheDocument();
    expect(screen.getByText("Tee")).toBeInTheDocument();
    // 2 x 5,000 + 1 x 3,000
    const order = await screen.findByRole("button", { name: /Place order/ });
    expect(order).toHaveTextContent("13,000");
    await waitFor(() => expect(order).toBeEnabled());
    expect(checkBasketAction).toHaveBeenCalledWith("ada", ["slides", "tee"]);
  });

  it("links to the terms and privacy pages in a new tab", async () => {
    vi.mocked(checkBasketAction).mockResolvedValue(HEALTHY);
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" />);
    const terms = await screen.findByRole("link", { name: /Terms/ });
    const privacy = screen.getByRole("link", { name: /Privacy/ });
    expect(terms).toHaveAttribute("href", "/legal/terms");
    expect(privacy).toHaveAttribute("href", "/legal/privacy");
    for (const link of [terms, privacy]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveClass("min-h-11");
    }
  });

  it("shows a problem and disables Place order until the line is removed", async () => {
    vi.mocked(checkBasketAction).mockResolvedValue(SOLD_OUT);
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" />);

    expect(
      await screen.findByText("Leather slides – 42 is sold out. Remove it to continue."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Place order/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Remove Leather slides – 42" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Place order/ })).toBeEnabled();
    });
    expect(screen.queryByText(/is sold out/)).not.toBeInTheDocument();
  });

  it("sends variantId and quantity for each line when ordering", async () => {
    vi.mocked(checkBasketAction).mockResolvedValue(HEALTHY);
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" />);

    const order = await screen.findByRole("button", { name: /Place order/ });
    await waitFor(() => expect(order).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Bola" } });
    fireEvent.change(screen.getByLabelText("WhatsApp number"), {
      target: { value: "08031234567" },
    });
    fireEvent.submit(order.closest("form") as HTMLFormElement);

    await waitFor(() => expect(placeOrder).toHaveBeenCalled());
    const call = vi.mocked(placeOrder).mock.calls[0];
    if (call === undefined) {
      throw new Error("placeOrder was not called");
    }
    const formData = call[2];
    const items = JSON.parse(String(formData.get("items")));
    expect(items).toEqual([
      { variantId: "v1", quantity: 2 },
      { variantId: "v2", quantity: 1 },
    ]);
    expect(formData.get("name")).toBe("Bola");
  });

  it("keeps Place order disabled when a re-check fails after a good check", async () => {
    vi.mocked(checkBasketAction).mockResolvedValueOnce(HEALTHY);
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" />);
    const order = await screen.findByRole("button", { name: /Place order/ });
    await waitFor(() => expect(order).toBeEnabled());

    // Removing a line changes the product list, which triggers a second check.
    vi.mocked(checkBasketAction).mockRejectedValue(new Error("network down"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Tee – M" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not check your basket/i);
    });
    expect(screen.getByRole("button", { name: /check your basket/i })).toBeDisabled();
  });

  it("empties the saved basket after the order succeeds", async () => {
    vi.mocked(checkBasketAction).mockResolvedValue(HEALTHY);
    vi.mocked(placeOrder).mockResolvedValue({
      status: "success",
      code: "GB-ABCD",
      totalKobo: 1300000,
    });
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" />);

    const order = await screen.findByRole("button", { name: /Place order/ });
    await waitFor(() => expect(order).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Bola" } });
    fireEvent.change(screen.getByLabelText("WhatsApp number"), {
      target: { value: "08031234567" },
    });
    fireEvent.submit(order.closest("form") as HTMLFormElement);

    expect(await screen.findByText("GB-ABCD")).toBeInTheDocument();
    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBe("[]");
    });
  });

  it("says the basket is empty when there are no lines", async () => {
    localStorage.clear();
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" />);
    expect(await screen.findByText("Your basket is empty.")).toBeInTheDocument();
    expect(checkBasketAction).not.toHaveBeenCalled();
  });
});
