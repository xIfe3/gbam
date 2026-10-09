import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { adminApiMock } = vi.hoisted(() => ({
  adminApiMock: { money: vi.fn(), analytics: vi.fn(), active: vi.fn() },
}));
vi.mock("@/lib/admin-api", () => ({ adminApi: adminApiMock }));
// The page only hands this action to the panel; it never runs in these tests.
vi.mock("./admin-actions", () => ({ activeNowAction: vi.fn() }));

import AnalyticsPage from "./analytics/page";
import MoneyPage from "./money/page";

const MONEY = {
  totals: {
    salesKobo: 1_050_000,
    itemsKobo: 1_000_000,
    deliveryKobo: 50_000,
    gbamFeesKobo: 20_000,
    paystackFeesKobo: 15_000,
    refundsKobo: 0,
    paidOrders: 3,
  },
  byDay: [
    { day: "2026-10-01", salesKobo: 1_050_000, paidOrders: 3 },
    { day: "2026-10-02", salesKobo: 0, paidOrders: 0 },
  ],
  byShop: [
    {
      shopId: "s1",
      shopName: "Ada Bakes",
      salesKobo: 1_050_000,
      paidOrders: 3,
      gbamFeesKobo: 20_000,
    },
  ],
};

const ANALYTICS = {
  funnel: [
    {
      week: "2026-09-28",
      signedUp: 4,
      verified: 3,
      firstProduct: 2,
      bankAccount: 1,
      firstPaidOrder: 1,
    },
  ],
  activeShops: { last7: 2, last30: 5 },
  orders: {
    placed: 10,
    paid: 6,
    expired: 3,
    cancelled: 1,
    paidRate: 0.6,
    averageOrderKobo: 500_000,
  },
  topShops: [{ shopId: "s1", shopName: "Ada Bakes", paidOrders: 6 }],
  visits: [
    { day: "2026-10-01", storefront: 30, product: 12, checkout: 8 },
    { day: "2026-10-02", storefront: 0, product: 0, checkout: 0 },
  ],
  visitFunnel: { visits: 42, orders: 10, paid: 6 },
};

const ACTIVE = { sellersInDashboard: 1, shoppers: 4, checkout: 0, admins: 1, topShops: [] };

beforeEach(() => {
  vi.clearAllMocks();
  adminApiMock.money.mockResolvedValue(MONEY);
  adminApiMock.analytics.mockResolvedValue(ANALYTICS);
  adminApiMock.active.mockResolvedValue(ACTIVE);
});

const range = { from: "2026-10-01", to: "2026-10-02" };

describe("Money page", () => {
  it("money page shows totals and the per-shop table", async () => {
    render(await MoneyPage({ searchParams: Promise.resolve(range) }));
    expect(adminApiMock.money).toHaveBeenCalledWith(range);
    expect(screen.getByText("Sales", { selector: "dt" }).parentElement).toHaveTextContent(
      "₦10,500",
    );
    expect(screen.getByText("gbam fees", { selector: "dt" }).parentElement).toHaveTextContent(
      "₦200",
    );
    expect(screen.getByText("Paid orders", { selector: "dt" }).parentElement).toHaveTextContent(
      "3",
    );
    const shops = screen.getByRole("table", { name: "Sales by shop" });
    const link = within(shops).getByRole("link", { name: "Ada Bakes" });
    expect(link).toHaveAttribute("href", "/admin/shops/s1");
    expect(screen.getByRole("figure", { name: "Sales per day" })).toBeInTheDocument();
  });

  it("the range picker marks the chosen preset", async () => {
    render(await MoneyPage({ searchParams: Promise.resolve({}) }));
    expect(adminApiMock.money).toHaveBeenCalledWith({ from: undefined, to: undefined });
    const thirty = screen.getByRole("link", { name: "30 days" });
    expect(thirty.getAttribute("href")).toMatch(/^\/admin\/money\?from=\d{4}-\d{2}-\d{2}&to=/);
    expect(thirty).toHaveAttribute("aria-current", "page");
  });
});

describe("Analytics page", () => {
  it("shows orders, the seller funnel, visits and active now", async () => {
    render(await AnalyticsPage({ searchParams: Promise.resolve(range) }));
    expect(adminApiMock.analytics).toHaveBeenCalledWith(range);
    expect(screen.getByText("Paid rate").parentElement).toHaveTextContent("60%");
    const funnel = screen.getByRole("table", { name: "New sellers by week" });
    expect(funnel).toHaveTextContent("4");
    expect(screen.getByRole("figure", { name: "Shop visits per day" })).toHaveTextContent(
      "Total: 42 over 2 days",
    );
    expect(screen.getByText("Shoppers").parentElement).toHaveTextContent("4");
  });
});
