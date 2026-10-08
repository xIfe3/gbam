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

const NO_ZONES = { zones: [], pickupNote: null };
const ZONES = {
  zones: [
    { id: "z-lekki", name: "Lekki / VI", feeKobo: 250000, isPickup: false },
    { id: "z-free", name: "Ikeja", feeKobo: 0, isPickup: false },
    { id: "z-pickup", name: "Pickup from shop", feeKobo: 0, isPickup: true },
  ],
  pickupNote: "Shop 12, Balogun Market",
};

describe("BasketView delivery", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(LINES));
    vi.mocked(checkBasketAction).mockReset();
    vi.mocked(checkBasketAction).mockResolvedValue(HEALTHY);
    vi.mocked(placeOrder).mockReset();
    vi.mocked(placeOrder).mockResolvedValue({ status: "idle" });
  });

  it("shows zones with prices, none picked", async () => {
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" delivery={ZONES} />);
    const lekki = await screen.findByRole("radio", { name: "Lekki / VI · ₦2,500" });
    expect(lekki).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Pickup from shop · Free" })).not.toBeChecked();
    // Until a zone is picked the order can't be placed.
    expect(
      await screen.findByRole("button", { name: "Choose delivery to continue" }),
    ).toBeDisabled();
  });

  it("total updates with the picked zone", async () => {
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" delivery={ZONES} />);
    fireEvent.click(await screen.findByRole("radio", { name: "Lekki / VI · ₦2,500" }));
    // Items 13,000 + delivery 2,500
    expect(await screen.findByRole("button", { name: "Place order · ₦15,500" })).toBeEnabled();
    expect(screen.getByText("Delivery (Lekki / VI)")).toBeInTheDocument();
  });

  it("free zone shows Free", async () => {
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" delivery={ZONES} />);
    fireEvent.click(await screen.findByRole("radio", { name: "Ikeja · Free" }));
    expect(screen.getByText("Delivery (Ikeja)").nextSibling).toHaveTextContent("Free");
    expect(screen.getByRole("textbox", { name: "Delivery address" })).toBeInTheDocument();
  });

  it("pickup hides address and shows pickup note", async () => {
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" delivery={ZONES} />);
    fireEvent.click(await screen.findByRole("radio", { name: "Pickup from shop · Free" }));
    expect(screen.queryByRole("textbox", { name: "Delivery address" })).not.toBeInTheDocument();
    expect(screen.getByText("Shop 12, Balogun Market")).toBeInTheDocument();
  });

  it("no zones: address only", async () => {
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" delivery={NO_ZONES} />);
    expect(await screen.findByRole("textbox", { name: "Delivery address" })).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});

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
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" delivery={NO_ZONES} />);

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
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" delivery={NO_ZONES} />);
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
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" delivery={NO_ZONES} />);

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
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" delivery={NO_ZONES} />);

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
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" delivery={NO_ZONES} />);
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
      trackingKey: "secret-key-abc",
    });
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" delivery={NO_ZONES} />);

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
    // The order-placed screen gives every way back to this order.
    expect(screen.getByRole("link", { name: "Track this order" })).toHaveAttribute(
      "href",
      "/track/GB-ABCD?k=secret-key-abc",
    );
    expect(screen.getByRole("button", { name: "Copy tracking link" })).toBeInTheDocument();
    expect(screen.getByText(/Take a screenshot of this code/)).toBeInTheDocument();
    const remembered = JSON.parse(localStorage.getItem("gbam-my-orders") ?? "[]") as {
      code: string;
      key: string;
    }[];
    expect(remembered[0]).toMatchObject({ code: "GB-ABCD", key: "secret-key-abc" });
  });

  it("uses only the product name for a default variant with an empty title", async () => {
    const jollof = {
      variantId: "v9",
      productSlug: "jollof",
      productName: "Jollof Rice",
      variantTitle: "",
      priceKobo: 200000,
      photoUrl: null,
      quantity: 1,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([jollof]));
    vi.mocked(checkBasketAction).mockResolvedValue([
      makeProduct("jollof", "Jollof Rice", "v9", "", 200000, 0),
    ]);
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" delivery={NO_ZONES} />);

    expect(
      await screen.findByText("Jollof Rice is sold out. Remove it to continue."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Jollof Rice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add one Jollof Rice" })).toBeInTheDocument();
  });

  it("offers to use the new price when the price changed", async () => {
    const repriced = [
      makeProduct("slides", "Leather slides", "v1", "42", 600000, 10),
      makeProduct("tee", "Tee", "v2", "M", 300000, null),
    ];
    vi.mocked(checkBasketAction).mockResolvedValue(repriced);
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" delivery={NO_ZONES} />);

    expect(await screen.findByText(/now costs/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Place order/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Use new price" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Place order/ })).toBeEnabled();
    });
    expect(screen.queryByText(/now costs/)).not.toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(saved[0].priceKobo).toBe(600000);
    expect(saved[0].quantity).toBe(2);
    // 2 x 6,000 + 1 x 3,000
    expect(screen.getByRole("button", { name: /Place order/ })).toHaveTextContent("15,000");
  });

  it("says the basket is empty when there are no lines", async () => {
    localStorage.clear();
    render(<BasketView shopSlug="ada" businessName="Ada Shoes" delivery={NO_ZONES} />);
    expect(await screen.findByText("Your basket is empty.")).toBeInTheDocument();
    expect(checkBasketAction).not.toHaveBeenCalled();
  });
});
