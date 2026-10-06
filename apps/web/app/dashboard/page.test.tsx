import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: { listOrders: vi.fn(), currentUser: vi.fn() } }));

import { api } from "@/lib/api";
import OrdersPage from "./page";

function props(status?: string) {
  const searchParams: Record<string, string> = {};
  if (status) {
    searchParams.status = status;
  }
  return { searchParams: Promise.resolve(searchParams) } as never;
}

describe("orders page empty states", () => {
  beforeEach(() => {
    vi.mocked(api.listOrders).mockReset();
    vi.mocked(api.currentUser).mockReset();
    vi.mocked(api.currentUser).mockResolvedValue({
      seller: { slug: "mama-ngozi" },
    } as never);
  });

  it("invites the seller to share their shop link when there are no orders", async () => {
    vi.mocked(api.listOrders).mockResolvedValue([]);
    render(await OrdersPage(props()));
    expect(screen.getByRole("heading", { name: "No orders yet" })).toBeInTheDocument();
    expect(screen.getByText("gbam.app/mama-ngozi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy shop link" })).toBeInTheDocument();
  });

  it("keeps a short message when a status filter is empty", async () => {
    vi.mocked(api.listOrders).mockResolvedValue([]);
    render(await OrdersPage(props("paid")));
    expect(screen.getByText(/No orders with status/)).toBeInTheDocument();
    // The friendly first-order card is only for "no orders at all".
    expect(screen.queryByRole("heading", { name: "No orders yet" })).not.toBeInTheDocument();
  });

  it("always shows the shop link with a copy button, even when there are orders", async () => {
    vi.mocked(api.listOrders).mockResolvedValue([
      {
        id: "o1",
        code: "GB-AB12",
        status: "pending",
        totalKobo: 500000,
        createdAt: new Date().toISOString(),
        customerName: "Ada",
        customerPhone: "2348012345678",
      },
    ] as never);
    render(await OrdersPage(props()));
    const bar = screen.getByRole("region", { name: "Your shop link" });
    expect(bar).toHaveAttribute("data-tour", "shop-link");
    expect(bar).toHaveTextContent("gbam.app/mama-ngozi");
    expect(screen.getByRole("button", { name: "Copy shop link" })).toBeInTheDocument();
  });
});
