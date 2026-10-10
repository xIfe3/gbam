import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { markRead, markAllRead, push } = vi.hoisted(() => ({
  markRead: vi.fn(async () => undefined),
  markAllRead: vi.fn(async () => undefined),
  push: vi.fn(),
}));
vi.mock("@/app/dashboard/bell-actions", () => ({
  markNotificationReadAction: markRead,
  markAllNotificationsReadAction: markAllRead,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { NotificationBell, type BellData } from "./notification-bell";

const DATA: BellData = {
  unread: 1,
  items: [
    {
      id: "n1",
      type: "info",
      title: "Gbam replied to your request",
      body: "#1042: Payout missing",
      link: "/dashboard/help/t1",
      readAt: null,
      createdAt: "2026-10-09T08:00:00Z",
    },
    {
      id: "n2",
      type: "warning",
      title: "Your payout account changed",
      body: "Payouts now go to Access Bank.",
      link: null,
      readAt: "2026-10-08T08:00:00Z",
      createdAt: "2026-10-08T07:00:00Z",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NotificationBell", () => {
  it("shows the unread count and the list when opened", () => {
    render(<NotificationBell data={DATA} />);
    const button = screen.getByRole("button", { name: "Notifications (1 unread)" });
    fireEvent.click(button);
    expect(screen.getByText("Gbam replied to your request")).toBeInTheDocument();
    expect(screen.getByText("Your payout account changed")).toBeInTheDocument();
  });

  it("opening an unread one marks it read and goes to its page", async () => {
    render(<NotificationBell data={DATA} />);
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Gbam replied to your request/ }));
    });
    expect(markRead).toHaveBeenCalledWith("n1");
    expect(push).toHaveBeenCalledWith("/dashboard/help/t1");
  });

  it("mark all read", async () => {
    render(<NotificationBell data={DATA} />);
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    });
    expect(markAllRead).toHaveBeenCalled();
  });

  it("nothing yet", () => {
    render(<NotificationBell data={{ unread: 0, items: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Nothing new.")).toBeInTheDocument();
  });
});
