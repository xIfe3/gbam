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
    expect(screen.queryByRole("button", { name: "Copy shop link" })).not.toBeInTheDocument();
  });
});
