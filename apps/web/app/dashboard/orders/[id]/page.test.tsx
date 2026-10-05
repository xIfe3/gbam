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
});
