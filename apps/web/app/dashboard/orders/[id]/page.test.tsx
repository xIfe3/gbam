import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(readonly status: number) {
      super("api error");
    }
  }
  return { api: { getOrder: vi.fn(), currentUser: vi.fn() }, ApiError };
});

vi.mock("../../actions", () => ({
  updateOrderStatus: vi.fn(),
}));

import { api } from "@/lib/api";
import OrderPage from "./page";

function order(stockShortfall: boolean) {
  return {
    id: "o1",
    code: "GB-1",
    status: "paid",
    totalKobo: 1200000,
    note: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    stockShortfall,
    customer: { name: "Ada", phone: "2348012345678" },
    issues: [],
    items: [
      {
        id: "i1",
        productName: "Ankara wrap dress",
        variantTitle: "M / Red",
        unitPriceKobo: 1200000,
        quantity: 1,
      },
      { id: "i2", productName: "Scarf", variantTitle: "", unitPriceKobo: 100000, quantity: 2 },
    ],
    events: [],
    payments: [],
    whatsappMessages: [],
  };
}

const props = { params: Promise.resolve({ id: "o1" }) } as never;

describe("order page", () => {
  beforeEach(() => {
    vi.mocked(api.getOrder).mockReset();
    vi.mocked(api.currentUser).mockResolvedValue({ seller: { hasPayoutAccount: true } } as never);
  });

  it("shows the variant title next to the product name", async () => {
    vi.mocked(api.getOrder).mockResolvedValue(order(false) as never);
    render(await OrderPage(props));
    expect(screen.getByText("1 × Ankara wrap dress – M / Red")).toBeInTheDocument();
    expect(screen.getByText("2 × Scarf")).toBeInTheDocument();
    expect(screen.queryByText("Stock ran out: refund needed")).not.toBeInTheDocument();
  });

  it("warns when stock ran out", async () => {
    vi.mocked(api.getOrder).mockResolvedValue(order(true) as never);
    render(await OrderPage(props));
    expect(screen.getByRole("alert")).toHaveTextContent("Stock ran out: refund needed");
  });

  it("seller order shows address with copy button", async () => {
    vi.mocked(api.getOrder).mockResolvedValue({
      ...order(false),
      subtotalKobo: 1400000,
      deliveryFeeKobo: 250000,
      totalKobo: 1650000,
      deliveryZoneName: "Lekki / VI",
      deliveryIsPickup: false,
      deliveryAddress: "12 Admiralty Way, Lekki",
      deliveryLandmark: "Opposite the bank",
    } as never);
    render(await OrderPage(props));
    const box = screen.getByRole("region", { name: "Delivery" });
    expect(box).toHaveTextContent("Lekki / VI");
    expect(box).toHaveTextContent("12 Admiralty Way, Lekki");
    expect(box).toHaveTextContent("Opposite the bank");
    expect(screen.getByRole("button", { name: "Copy address" })).toBeInTheDocument();
    expect(screen.getByText("Delivery (Lekki / VI)").nextSibling).toHaveTextContent("₦2,500");
  });

  it("pickup order says the customer will pick up", async () => {
    vi.mocked(api.getOrder).mockResolvedValue({
      ...order(false),
      deliveryZoneName: "Pickup from shop",
      deliveryIsPickup: true,
      deliveryAddress: null,
      deliveryLandmark: null,
    } as never);
    render(await OrderPage(props));
    const box = screen.getByRole("region", { name: "Delivery" });
    expect(box).toHaveTextContent("Customer will pick up");
    expect(screen.queryByRole("button", { name: "Copy address" })).not.toBeInTheDocument();
  });

  it("old order without delivery renders no delivery box", async () => {
    // order() has no delivery fields at all, like an order placed before delivery existed.
    vi.mocked(api.getOrder).mockResolvedValue(order(false) as never);
    render(await OrderPage(props));
    expect(screen.queryByRole("region", { name: "Delivery" })).not.toBeInTheDocument();
  });
});
