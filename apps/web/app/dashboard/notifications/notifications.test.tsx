import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { apiMock, actions } = vi.hoisted(() => ({
  apiMock: { notificationsPage: vi.fn(), notification: vi.fn(), markNotificationRead: vi.fn() },
  actions: {
    bulkNotificationsAction: vi.fn(async () => ({})),
    markNotificationUnreadAction: vi.fn(async () => ({})),
    trashNotificationAction: vi.fn(async () => ({})),
    restoreNotificationAction: vi.fn(async () => ({})),
    deleteNotificationAction: vi.fn(async () => ({})),
    emptyNotificationTrashAction: vi.fn(async () => ({})),
    markAllNotificationsReadAction: vi.fn(async () => undefined),
    markNotificationReadAction: vi.fn(async () => undefined),
  },
}));
vi.mock("@/lib/api", () => ({ api: apiMock, ApiError: class extends Error {} }));
vi.mock("../bell-actions", () => actions);
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  unstable_rethrow: () => undefined,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import NotificationPage from "./[id]/page";
import NotificationsPage from "./page";

const ID = "6f1c1f0e-2b7a-4d61-9a5e-2f5a1c9b0d11";
const ROW = {
  id: ID,
  type: "info",
  title: "Gbam replied to your request",
  body: "#1042: Payout missing",
  link: "/dashboard/help/t1",
  readAt: null,
  deletedAt: null,
  createdAt: "2026-10-09T08:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.notificationsPage.mockResolvedValue({
    rows: [ROW],
    total: 1,
    page: 1,
    pageSize: 30,
    unread: 1,
  });
  apiMock.notification.mockResolvedValue(ROW);
});

describe("notifications page", () => {
  it("lists them with tabs, a type filter and search", async () => {
    render(
      await NotificationsPage({ searchParams: Promise.resolve({ tab: "unread", q: "payout" }) }),
    );
    expect(apiMock.notificationsPage).toHaveBeenCalledWith(
      expect.objectContaining({ tab: "unread", q: "payout", page: 1 }),
    );
    expect(screen.getByRole("link", { name: /Unread/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("searchbox", { name: "Search notifications" })).toHaveValue("payout");
    const item = screen.getByRole("link", { name: /Gbam replied to your request/ });
    expect(item).toHaveAttribute("href", `/dashboard/notifications/${ID}`);
  });

  it("ticked ones can be moved to the trash together", async () => {
    render(await NotificationsPage({ searchParams: Promise.resolve({}) }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Gbam replied/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Move to trash" }));
    });
    expect(actions.bulkNotificationsAction).toHaveBeenCalledWith([ID], "trash");
  });

  it("the trash can be emptied", async () => {
    apiMock.notificationsPage.mockResolvedValue({
      rows: [{ ...ROW, deletedAt: "2026-10-09T09:00:00Z" }],
      total: 1,
      page: 1,
      pageSize: 30,
      unread: 0,
    });
    render(await NotificationsPage({ searchParams: Promise.resolve({ tab: "trash" }) }));
    expect(screen.getByText(/deleted for good after 30 days/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empty trash" })).toBeInTheDocument();
  });
});

describe("notification detail page", () => {
  it("opening it marks it read and offers its link", async () => {
    render(await NotificationPage({ params: Promise.resolve({ id: ID }) }));
    expect(apiMock.markNotificationRead).toHaveBeenCalledWith(ID);
    expect(
      screen.getByRole("heading", { name: "Gbam replied to your request" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/dashboard/help/t1",
    );
    const actionsBox = screen.getByRole("group", { name: "Actions" });
    expect(within(actionsBox).getByRole("button", { name: "Mark unread" })).toBeInTheDocument();
    expect(within(actionsBox).getByRole("button", { name: "Move to trash" })).toBeInTheDocument();
  });

  it("in the trash: restore or delete for good", async () => {
    apiMock.notification.mockResolvedValue({ ...ROW, deletedAt: "2026-10-09T09:00:00Z" });
    render(await NotificationPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete for good" })).toBeInTheDocument();
  });
});
