import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { adminApiMock } = vi.hoisted(() => ({
  adminApiMock: { adminSessions: vi.fn(), sellerSessions: vi.fn(), audit: vi.fn() },
}));
vi.mock("@/lib/admin-api", () => ({ adminApi: adminApiMock }));
vi.mock("./admin-actions", () => ({
  endAdminSessionAction: vi.fn(),
  endAllAdminSessionsAction: vi.fn(),
  endSellerSessionAction: vi.fn(),
}));

import { deviceName, shortIp } from "@/components/admin/device";
import AuditPage from "./audit/page";
import SessionsPage from "./sessions/page";

const ADMIN_SESSIONS = [
  {
    id: "s-me",
    adminId: "a-me",
    adminName: "Ifeanyi",
    roleName: null,
    isSuperadmin: true,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
    ip: "102.89.10.20",
    createdAt: "2026-10-08T09:00:00Z",
    lastUsedAt: "2026-10-08T09:10:00Z",
    isCurrent: true,
  },
  {
    id: "s-chika",
    adminId: "a-chika",
    adminName: "Chika",
    roleName: "Support",
    isSuperadmin: false,
    userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120.0",
    ip: "197.210.1.2",
    createdAt: "2026-10-08T08:00:00Z",
    lastUsedAt: "2026-10-08T09:05:00Z",
    isCurrent: false,
  },
];

const search = (values: Record<string, string>) => ({ searchParams: Promise.resolve(values) });

beforeEach(() => {
  vi.clearAllMocks();
  adminApiMock.adminSessions.mockResolvedValue(ADMIN_SESSIONS);
  adminApiMock.sellerSessions.mockResolvedValue([]);
});

describe("superadmin pages", () => {
  it("sessions page has two tabs and This device can't be ended", async () => {
    render(await SessionsPage(search({})));
    expect(screen.getByRole("link", { name: "Admins" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sellers" })).toHaveAttribute(
      "href",
      "/admin/sessions?tab=sellers",
    );
    expect(screen.getByText("This device")).toBeInTheDocument();
    // Only Chika's session can be ended: one "Sign out", one "Sign out everywhere".
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Sign out everywhere" })).toHaveLength(1);
    expect(screen.getByText(/Chrome on Android · 197\.210\.x\.x/)).toBeInTheDocument();
  });

  it("the sellers tab searches and shows sellers", async () => {
    adminApiMock.sellerSessions.mockResolvedValue([
      {
        id: "ss1",
        shopName: "Ada Bakes",
        slug: "ada",
        email: "ada@example.com",
        userAgent: null,
        ip: null,
        createdAt: "2026-10-08T08:00:00Z",
        lastUsedAt: null,
      },
    ]);
    render(await SessionsPage(search({ tab: "sellers", q: "ada" })));
    expect(adminApiMock.sellerSessions).toHaveBeenCalledWith("ada");
    expect(screen.getByText(/Ada Bakes · ada@example\.com/)).toBeInTheDocument();
  });

  it("audit filters by admin", async () => {
    adminApiMock.audit.mockResolvedValue({
      rows: [
        {
          id: "e1",
          adminId: "a-chika",
          adminName: "Chika",
          action: "shop.suspend",
          targetType: "shop",
          targetId: "s1",
          note: "Reported for fraud",
          before: null,
          after: null,
          ip: null,
          batchId: null,
          createdAt: "2026-10-08T09:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    render(await AuditPage(search({ adminId: "a-chika" })));
    expect(adminApiMock.audit).toHaveBeenCalledWith(
      expect.objectContaining({ adminId: "a-chika" }),
    );
    expect(screen.getByText(/one admin's actions/)).toBeInTheDocument();
    expect(screen.getByText("“Reported for fraud”")).toBeInTheDocument();
  });
});

describe("device helpers", () => {
  it("names common devices and shortens IPs", () => {
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1")).toBe(
      "Safari on iPhone",
    );
    expect(deviceName(null)).toBe("Unknown device");
    expect(shortIp("102.89.10.20")).toBe("102.89.x.x");
    expect(shortIp(null)).toBe("—");
  });
});
