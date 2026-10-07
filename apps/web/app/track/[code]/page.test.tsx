import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(readonly status: number) {
      super("api error");
    }
  }
  return { api: { trackView: vi.fn() }, ApiError };
});
vi.mock("../actions", () => ({ payNowAction: vi.fn(), reportIssueAction: vi.fn() }));

import { api, ApiError } from "@/lib/api";
import TrackOrderPage from "./page";

const TRACKED = {
  shop: { slug: "ada", businessName: "Ada Bakes", whatsappPhone: "2348099999999" },
  order: {
    code: "GB-7B2Q",
    status: "awaiting_payment",
    totalKobo: 1000000,
    createdAt: "2026-10-05T10:00:00Z",
    items: [{ productName: "Cake", variantTitle: "Large", unitPriceKobo: 500000, quantity: 2 }],
    events: [
      { toStatus: "pending", createdAt: "2026-10-05T10:00:00Z" },
      { toStatus: "awaiting_payment", createdAt: "2026-10-05T11:00:00Z" },
    ],
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

describe("customer tracking page", () => {
  beforeEach(() => {
    vi.mocked(api.trackView).mockReset();
    vi.mocked(api.trackView).mockResolvedValue(TRACKED as never);
  });

  it("shows where the order is, what was ordered, and the total", async () => {
    render(await TrackOrderPage(props("secret-key-abcdefghijklmnop")));
    expect(screen.getByRole("heading", { name: "GB-7B2Q" })).toBeInTheDocument();
    const steps = screen.getAllByRole("listitem");
    const waiting = steps.find((li) => li.textContent?.includes("Waiting for payment"));
    expect(waiting).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("2 × Cake – Large")).toBeInTheDocument();
    const totals = screen.getAllByText("₦10,000");
    expect(totals.length).toBeGreaterThan(0);
    expect(api.trackView).toHaveBeenCalledWith("GB-7B2Q", "secret-key-abcdefghijklmnop");
  });

  it("offers Pay now only while payment is awaited", async () => {
    const { unmount } = render(await TrackOrderPage(props("secret-key-abcdefghijklmnop")));
    expect(screen.getByRole("button", { name: "Pay ₦10,000 now" })).toBeInTheDocument();
    unmount();
    vi.mocked(api.trackView).mockResolvedValue({
      ...TRACKED,
      canPay: false,
      order: { ...TRACKED.order, status: "paid" },
    } as never);
    render(await TrackOrderPage(props("secret-key-abcdefghijklmnop")));
    expect(screen.queryByRole("button", { name: /Pay .* now/ })).toBeNull();
  });

  it("opens WhatsApp with the seller, the order code already typed", async () => {
    render(await TrackOrderPage(props("secret-key-abcdefghijklmnop")));
    const link = screen.getByRole("link", { name: /Message Ada Bakes on WhatsApp/ });
    expect(link.getAttribute("href")).toBe(
      `https://wa.me/2348099999999?text=${encodeURIComponent("Hi Ada Bakes, about my order GB-7B2Q")}`,
    );
  });

  it("shows reported problems and offers the report form", async () => {
    vi.mocked(api.trackView).mockResolvedValue({
      ...TRACKED,
      issues: [{ reason: "not_received", createdAt: "2026-10-06T09:00:00Z", resolved: false }],
    } as never);
    render(await TrackOrderPage(props("secret-key-abcdefghijklmnop")));
    const help = screen.getByRole("region", { name: "Need help?" });
    const reported = within(help)
      .getAllByRole("listitem")
      .find((li) => li.textContent?.includes("The seller has been told"));
    expect(reported).toHaveTextContent("Haven't received my order");
    expect(screen.getByText("Report a problem")).toBeInTheDocument();
  });

  it("sends people without the key to the lookup form, and a wrong key to not found", async () => {
    await expect(TrackOrderPage(props())).rejects.toThrow("NEXT_REDIRECT /track");
    vi.mocked(api.trackView).mockRejectedValue(new ApiError(404, null));
    await expect(TrackOrderPage(props("wrong-key-abcdefghijklmnopq"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
