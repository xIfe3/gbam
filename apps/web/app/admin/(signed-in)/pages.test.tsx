import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { adminApiMock } = vi.hoisted(() => ({
  adminApiMock: { me: vi.fn(), shop: vi.fn(), orders: vi.fn(), refunds: vi.fn() },
}));
vi.mock("@/lib/admin-api", () => ({ adminApi: adminApiMock }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  unstable_rethrow: () => undefined,
}));
// The pages only pass these actions to forms; they never run in these tests.
vi.mock("./admin-actions", () => ({
  feeWaiverAction: vi.fn(),
  reopenShopAction: vi.fn(),
  resendVerificationAction: vi.fn(),
  suspendShopAction: vi.fn(),
  unlockSellerAction: vi.fn(),
  resolveRefundAction: vi.fn(),
}));

import OrdersPage from "./orders/page";
import RefundsPage from "./refunds/page";
import ShopDetailPage from "./shops/[id]/page";

function me(permissions: string[]) {
  return {
    id: "a1",
    name: "Chika",
    email: "c@x.com",
    isSuperadmin: false,
    role: null,
    permissions,
  };
}

const SHOP = {
  shop: {
    id: "s1",
    slug: "ada",
    businessName: "Ada Bakes",
    whatsappPhone: "2348012345678",
    status: "active",
    suspendedAt: null,
    suspendedReason: null,
    closedAt: null,
    feeWaivedUntil: null,
    createdAt: "2026-10-01T10:00:00Z",
    productCount: 3,
  },
  owner: {
    id: "u1",
    email: "ada@example.com",
    emailVerified: true,
    lockedUntil: null,
    createdAt: "2026-10-01T10:00:00Z",
  },
  payoutAccount: { bankName: "Access Bank", accountLast4: "6789", bankAccountName: "ADA OBI" },
  recentOrders: [],
};

const shopProps = { params: Promise.resolve({ id: "s1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  adminApiMock.shop.mockResolvedValue(SHOP);
});

describe("admin pages", () => {
  it("shop page buttons follow permissions", async () => {
    adminApiMock.me.mockResolvedValue(me(["shops.view"]));
    const { unmount } = render(await ShopDetailPage(shopProps));
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suspend shop" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unlock seller" })).toBeNull();
    unmount();

    adminApiMock.me.mockResolvedValue(me(["shops.view", "shops.suspend", "sellers.help"]));
    render(await ShopDetailPage(shopProps));
    expect(screen.getByRole("button", { name: "Suspend shop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock seller" })).toBeInTheDocument();
    expect(screen.getByText(/ending 6789/)).toBeInTheDocument();
  });

  it("orders search by code", async () => {
    adminApiMock.orders.mockResolvedValue({
      rows: [
        {
          id: "o1",
          code: "GB-7K2Q",
          status: "paid",
          totalKobo: 450000,
          createdAt: "2026-10-01T10:00:00Z",
          customerName: "Ada",
          customerPhone: "2348011112222",
          shopId: "s1",
          shopName: "Ada Bakes",
          openIssues: 1,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    render(await OrdersPage({ searchParams: Promise.resolve({ q: "GB-7K2Q" }) }));
    expect(adminApiMock.orders).toHaveBeenCalledWith(
      expect.objectContaining({ q: "GB-7K2Q", page: 1 }),
    );
    expect(screen.getByRole("textbox", { name: /Order code or phone/ })).toHaveValue("GB-7K2Q");
    expect(screen.getByRole("link", { name: "GB-7K2Q" })).toHaveAttribute(
      "href",
      "/admin/orders/o1",
    );
    expect(screen.getByText("Problem reported")).toBeInTheDocument();
  });

  it("refunds page shows each waiting case with the tick and the note", async () => {
    adminApiMock.refunds.mockResolvedValue([
      {
        id: "r1",
        orderId: "o1",
        orderCode: "GB-7K2Q",
        orderStatus: "cancelled",
        shopName: "Ada Bakes",
        paymentReference: "gbam_GB-7K2Q_ab12",
        reason: "Paid after it was cancelled",
        amountKobo: 450000,
        createdAt: "2026-10-01T10:00:00Z",
        resolvedAt: null,
      },
    ]);
    render(await RefundsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("gbam_GB-7K2Q_ab12")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "The money is back with the customer" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark refunded" })).toBeInTheDocument();
  });
});
