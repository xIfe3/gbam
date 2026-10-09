import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { adminApiMock } = vi.hoisted(() => ({
  adminApiMock: { me: vi.fn(), tickets: vi.fn(), ticket: vi.fn(), ticketAssignees: vi.fn() },
}));
vi.mock("@/lib/admin-api", () => ({ adminApi: adminApiMock }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  unstable_rethrow: () => undefined,
  useRouter: () => ({ refresh: vi.fn() }),
}));
// The pages only hand these actions to forms and buttons; they never run in these tests.
vi.mock("./admin-actions", () => ({
  bulkTicketsAction: vi.fn(),
  ticketReplyAction: vi.fn(),
  ticketNoteAction: vi.fn(),
  updateTicketAction: vi.fn(),
  deleteTicketAction: vi.fn(),
  restoreTicketAction: vi.fn(),
}));

import TicketDetailPage from "./tickets/[id]/page";
import TicketsPage from "./tickets/page";

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

const ID = "6f1c1f0e-2b7a-4d61-9a5e-2f5a1c9b0d11";

const LIST = {
  rows: [
    {
      id: ID,
      number: 1042,
      subject: "Payout missing",
      status: "open",
      priority: "urgent",
      source: "seller",
      requesterName: "Ada",
      shopName: "Ada Bakes",
      assigneeName: null,
      createdAt: "2026-10-09T08:00:00Z",
      updatedAt: "2026-10-09T09:00:00Z",
    },
  ],
  total: 1,
  page: 1,
  pageSize: 50,
};

const DETAIL = {
  ticket: {
    id: ID,
    number: 1042,
    subject: "Payout missing",
    source: "seller",
    status: "open",
    priority: "urgent",
    requesterName: "Ada",
    requesterEmail: "ada@example.com",
    assigneeId: null,
    deletedAt: null,
    createdAt: "2026-10-09T08:00:00Z",
  },
  shop: { id: "s1", slug: "ada", businessName: "Ada Bakes" },
  order: { id: "o1", code: "GB-7K2Q" },
  assigneeName: null,
  messages: [
    {
      id: "m1",
      author: "requester",
      adminName: null,
      body: "Nothing came to my bank.",
      internal: false,
      createdAt: "2026-10-09T08:00:00Z",
    },
    {
      id: "m2",
      author: "admin",
      adminName: "Chika",
      body: "Check their Paystack subaccount.",
      internal: true,
      createdAt: "2026-10-09T08:30:00Z",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  adminApiMock.tickets.mockResolvedValue(LIST);
  adminApiMock.ticket.mockResolvedValue(DETAIL);
  adminApiMock.ticketAssignees.mockResolvedValue([{ id: "a1", name: "Chika" }]);
});

describe("Tickets list", () => {
  it("list filters and bulk", async () => {
    adminApiMock.me.mockResolvedValue(me(["tickets.view", "tickets.handle"]));
    render(
      await TicketsPage({ searchParams: Promise.resolve({ status: "open", assignee: "me" }) }),
    );
    expect(adminApiMock.tickets).toHaveBeenCalledWith(
      expect.objectContaining({ status: "open", assignee: "me", page: 1 }),
    );
    const row = screen.getByRole("row", { name: /Payout missing/ });
    expect(within(row).getByRole("link", { name: /Payout missing/ })).toHaveAttribute(
      "href",
      `/admin/tickets/${ID}`,
    );
    expect(row).toHaveTextContent("#1042");
    expect(row).toHaveTextContent("Urgent");
    expect(screen.getByRole("checkbox", { name: /Payout missing/ })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /Search/ })).toBeInTheDocument();
  });

  it("view-only admins get no checkboxes", async () => {
    adminApiMock.me.mockResolvedValue(me(["tickets.view"]));
    render(await TicketsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("Ticket detail", () => {
  it("detail shows notes marked internal", async () => {
    adminApiMock.me.mockResolvedValue(me(["tickets.view", "tickets.handle"]));
    render(await TicketDetailPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByRole("heading", { name: /Payout missing/ })).toBeInTheDocument();
    const note = screen.getByText("Check their Paystack subaccount.").closest("li");
    expect(note).toHaveTextContent("Internal note");
    expect(note).toHaveTextContent("Chika");
    expect(screen.getByRole("link", { name: "Ada Bakes" })).toHaveAttribute(
      "href",
      "/admin/shops/s1",
    );
    expect(screen.getByRole("link", { name: "GB-7K2Q" })).toHaveAttribute(
      "href",
      "/admin/orders/o1",
    );
  });

  it("reply and note forms", async () => {
    adminApiMock.me.mockResolvedValue(me(["tickets.view", "tickets.handle"]));
    render(await TicketDetailPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByRole("textbox", { name: /Reply to Ada/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Internal note/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Assigned to" })).toBeInTheDocument();
  });

  it("handle-only controls hidden for view-only", async () => {
    adminApiMock.me.mockResolvedValue(me(["tickets.view"]));
    render(await TicketDetailPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
