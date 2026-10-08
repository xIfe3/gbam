import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(readonly status: number) {
      super("api error");
    }
  }
  return { api: { trackView: vi.fn() }, ApiError };
});
vi.mock("@/app/track/actions", () => ({ payNowAction: vi.fn() }));

import { api } from "@/lib/api";
import PayPage from "./page";

const KEY = "secret-key-abcdefghijklmnop";

const TRACKED = {
  shop: { slug: "ada", businessName: "Ada Bakes", whatsappPhone: "2348099999999" },
  order: {
    code: "GB-7B2Q",
    status: "awaiting_payment",
    totalKobo: 1000000,
    createdAt: "2026-10-05T10:00:00Z",
    items: [{ productName: "Cake", variantTitle: "Large", unitPriceKobo: 500000, quantity: 2 }],
    events: [],
  },
  issues: [],
  canPay: true,
};

function props(k?: string) {
  const searchParams: Record<string, string> = {};
  if (k) {
    searchParams.k = k;
  }
  return {
    params: Promise.resolve({ code: "GB-7B2Q" }),
    searchParams: Promise.resolve(searchParams),
  } as never;
}

describe("review & pay page", () => {
  beforeEach(() => {
    vi.mocked(api.trackView).mockReset();
    vi.mocked(api.trackView).mockResolvedValue(TRACKED as never);
  });

  it("shows the shop, the items and the total before the Pay button", async () => {
    render(await PayPage(props(KEY)));
    expect(screen.getByRole("heading", { name: "GB-7B2Q" })).toBeInTheDocument();
    expect(screen.getByText("From Ada Bakes")).toBeInTheDocument();
    expect(screen.getByText("2 × Cake – Large")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay ₦10,000 securely" })).toBeInTheDocument();
  });

  it("sends an order that can't be paid any more to its tracking page", async () => {
    vi.mocked(api.trackView).mockResolvedValue({
      ...TRACKED,
      canPay: false,
      order: { ...TRACKED.order, status: "paid" },
    } as never);
    await expect(PayPage(props(KEY))).rejects.toThrow(`NEXT_REDIRECT /track/GB-7B2Q?k=${KEY}`);
  });

  it("sends people without the key to the lookup form", async () => {
    await expect(PayPage(props())).rejects.toThrow("NEXT_REDIRECT /track");
  });

  it("pay page shows items, delivery, total", async () => {
    vi.mocked(api.trackView).mockResolvedValue({
      ...TRACKED,
      order: {
        ...TRACKED.order,
        subtotalKobo: 1000000,
        deliveryFeeKobo: 250000,
        totalKobo: 1250000,
        delivery: { zoneName: "Lekki / VI", isPickup: false, pickupNote: null },
      },
    } as never);
    render(await PayPage(props(KEY)));
    expect(screen.getByText("Items").nextSibling).toHaveTextContent("₦10,000");
    expect(screen.getByText("Delivery (Lekki / VI)").nextSibling).toHaveTextContent("₦2,500");
    expect(screen.getByText("Total").nextSibling).toHaveTextContent("₦12,500");
  });
});
