import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { adminApiMock } = vi.hoisted(() => ({
  adminApiMock: { announcements: vi.fn(), announcement: vi.fn(), notifications: vi.fn() },
}));
vi.mock("@/lib/admin-api", () => ({ adminApi: adminApiMock }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  unstable_rethrow: () => undefined,
}));
// The pages only hand these actions to forms and buttons; they never run in these tests.
vi.mock("./messaging-actions", () => ({
  previewAnnouncementAction: vi.fn(),
  createAnnouncementAction: vi.fn(),
  updateAnnouncementAction: vi.fn(),
  testAnnouncementAction: vi.fn(),
  sendAnnouncementAction: vi.fn(),
  cancelAnnouncementAction: vi.fn(),
  deleteAnnouncementAction: vi.fn(),
  restoreAnnouncementAction: vi.fn(),
  countNotificationAction: vi.fn(),
  sendNotificationAction: vi.fn(),
  deleteNotificationAction: vi.fn(),
  restoreNotificationAction: vi.fn(),
}));

import AnnouncementPage from "./announcements/[id]/page";
import AnnouncementsPage from "./announcements/page";
import NotificationsPage from "./notifications/page";

const ID = "6f1c1f0e-2b7a-4d61-9a5e-2f5a1c9b0d11";

function announcement(status: string) {
  return {
    announcement: {
      id: ID,
      subject: "Delivery zones are here",
      body: "Hello **sellers**",
      buttonLabel: null,
      buttonUrl: null,
      audience: { verified: true },
      status,
      scheduledAt: null,
      sentAt: null,
      deletedAt: null,
      createdAt: "2026-10-09T08:00:00Z",
    },
    counts: { queued: 0, sent: 40, failed: 2 },
    audienceCount: 42,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Announcements", () => {
  it("list shows each with its status", async () => {
    adminApiMock.announcements.mockResolvedValue([
      {
        id: ID,
        subject: "Delivery zones are here",
        status: "sent",
        scheduledAt: null,
        sentAt: "2026-10-09T09:00:00Z",
        createdAt: "2026-10-09T08:00:00Z",
      },
    ]);
    render(await AnnouncementsPage({ searchParams: Promise.resolve({}) }));
    const row = screen.getByRole("row", { name: /Delivery zones are here/ });
    expect(row).toHaveTextContent("Sent");
    expect(within(row).getByRole("link", { name: "Delivery zones are here" })).toHaveAttribute(
      "href",
      `/admin/announcements/${ID}`,
    );
    expect(screen.getByRole("link", { name: "New announcement" })).toHaveAttribute(
      "href",
      "/admin/announcements/new",
    );
  });

  it("a draft can be edited, tested and sent (typing the count)", async () => {
    adminApiMock.announcement.mockResolvedValue(announcement("draft"));
    render(await AnnouncementPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByRole("textbox", { name: "Subject" })).toHaveValue("Delivery zones are here");
    expect(screen.getByRole("button", { name: "Send a test to me" })).toBeInTheDocument();
    expect(screen.getByText(/goes to 42 sellers/)).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /Type 42 to confirm/ })).toBeInTheDocument();
  });

  it("a sent one shows its counts and can't be edited", async () => {
    adminApiMock.announcement.mockResolvedValue(announcement("sent"));
    render(await AnnouncementPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByText("Sent", { selector: "dt" }).parentElement).toHaveTextContent("40");
    expect(screen.getByText("Failed", { selector: "dt" }).parentElement).toHaveTextContent("2");
    expect(screen.queryByRole("textbox", { name: "Subject" })).toBeNull();
  });

  it("a scheduled one can be cancelled", async () => {
    adminApiMock.announcement.mockResolvedValue({
      ...announcement("scheduled"),
      announcement: {
        ...announcement("scheduled").announcement,
        scheduledAt: "2026-10-12T08:30:00Z",
      },
    });
    render(await AnnouncementPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByRole("button", { name: "Cancel sending" })).toBeInTheDocument();
  });
});

describe("Notifications", () => {
  it("compose form and the list with read counts", async () => {
    adminApiMock.notifications.mockResolvedValue([
      {
        id: "c1",
        type: "action",
        title: "Add your bank account",
        body: "Customers can't pay you yet.",
        link: "/dashboard/settings",
        endsAt: null,
        recipientCount: 10,
        readCount: 4,
        createdAt: "2026-10-09T08:00:00Z",
      },
    ]);
    render(await NotificationsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /Add your bank account/ });
    expect(row).toHaveTextContent("4 of 10");
    expect(row).toHaveTextContent("Action needed");
  });
});
