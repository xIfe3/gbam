import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { adminApiMock } = vi.hoisted(() => ({
  adminApiMock: {
    me: vi.fn(),
    refunds: vi.fn(),
    messages: vi.fn(),
    issues: vi.fn(),
    shops: vi.fn(),
    money: vi.fn(),
  },
}));
vi.mock("@/lib/admin-api", () => ({ adminApi: adminApiMock }));

import OverviewPage from "./page";

const ME = {
  id: "a1",
  name: "Chika",
  email: "c@example.com",
  isSuperadmin: false,
  role: { id: "r1", name: "Finance" },
  permissions: ["refunds.handle"],
};

beforeEach(() => {
  vi.clearAllMocks();
  adminApiMock.refunds.mockResolvedValue([{ id: "x" }, { id: "y" }]);
  adminApiMock.messages.mockResolvedValue([{ id: "m" }]);
  adminApiMock.issues.mockResolvedValue([]);
  adminApiMock.shops.mockResolvedValue({ rows: [], total: 4, page: 1, pageSize: 50 });
  adminApiMock.money.mockResolvedValue({ totals: { salesKobo: 250_000 }, byDay: [], byShop: [] });
});

describe("admin overview", () => {
  it("overview shows waiting refunds", async () => {
    adminApiMock.me.mockResolvedValue(ME);
    render(await OverviewPage({}));
    const refunds = screen.getByRole("link", { name: /Refunds waiting/ });
    expect(refunds).toHaveTextContent("2");
    expect(refunds).toHaveAttribute("href", "/admin/refunds");
  });

  it("only shows what the role allows", async () => {
    adminApiMock.me.mockResolvedValue(ME);
    render(await OverviewPage({}));
    expect(screen.queryByText(/Contact messages/)).toBeNull();
    expect(adminApiMock.messages).not.toHaveBeenCalled();
  });

  it("a superadmin sees every count", async () => {
    adminApiMock.me.mockResolvedValue({ ...ME, isSuperadmin: true, permissions: [] });
    render(await OverviewPage({}));
    expect(screen.getByRole("link", { name: /Contact messages/ })).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: /Suspended shops/ })).toHaveTextContent("4");
  });

  it("shows today's sales to admins who can see money", async () => {
    adminApiMock.me.mockResolvedValue({ ...ME, permissions: ["money.view"] });
    render(await OverviewPage({}));
    const sales = screen.getByRole("link", { name: /Today's sales/ });
    expect(sales).toHaveTextContent("₦2,500");
    expect(sales.getAttribute("href")).toMatch(/^\/admin\/money\?from=\d{4}-\d{2}-\d{2}&to=/);
  });

  it("no sales tile without money.view", async () => {
    adminApiMock.me.mockResolvedValue(ME);
    render(await OverviewPage({}));
    expect(screen.queryByText(/Today's sales/)).toBeNull();
    expect(adminApiMock.money).not.toHaveBeenCalled();
  });

  it("explains when a page wasn't allowed", async () => {
    adminApiMock.me.mockResolvedValue(ME);
    render(await OverviewPage({ searchParams: Promise.resolve({ denied: "1" }) }));
    expect(screen.getByRole("status")).toHaveTextContent("Your role doesn't allow that page");
  });
});
