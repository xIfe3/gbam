import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiMock, FakeApiError, refresh } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      super("api");
    }
  }
  return {
    apiMock: {
      helpTickets: vi.fn(),
      helpTicket: vi.fn(),
      openHelpTicket: vi.fn(),
      replyHelpTicket: vi.fn(),
      escalateOrderIssue: vi.fn(),
      publicTicket: vi.fn(),
      replyPublicTicket: vi.fn(),
    },
    FakeApiError,
    refresh: vi.fn(),
  };
});
vi.mock("@/lib/api", () => ({ api: apiMock, ApiError: FakeApiError }));
vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  unstable_rethrow: () => undefined,
}));

import PublicTicketPage from "@/app/(marketing)/help/tickets/[id]/page";
import {
  escalateIssueAction,
  openTicketAction,
  publicReplyAction,
  replyTicketAction,
} from "./actions";
import TicketPage from "./[id]/page";
import HelpPage from "./page";

const TICKET = {
  id: "6f1c1f0e-2b7a-4d61-9a5e-2f5a1c9b0d11",
  number: 1042,
  subject: "Payout missing",
  status: "waiting",
  createdAt: "2026-10-09T08:00:00Z",
  messages: [
    {
      id: "m1",
      author: "requester",
      body: "Nothing came to my bank.",
      createdAt: "2026-10-09T08:00:00Z",
    },
    {
      id: "m2",
      author: "admin",
      body: "We're checking with Paystack.",
      createdAt: "2026-10-09T09:00:00Z",
    },
  ],
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("seller help pages", () => {
  it("lists my tickets and offers a new-ticket form", async () => {
    apiMock.helpTickets.mockResolvedValue([
      {
        id: TICKET.id,
        number: 1042,
        subject: "Payout missing",
        status: "waiting",
        createdAt: TICKET.createdAt,
        updatedAt: TICKET.createdAt,
      },
    ]);
    render(await HelpPage());
    const link = screen.getByRole("link", { name: /Payout missing/ });
    expect(link).toHaveAttribute("href", `/dashboard/help/${TICKET.id}`);
    expect(link).toHaveTextContent("#1042");
    expect(link).toHaveTextContent("We replied");
    expect(screen.getByRole("textbox", { name: "Subject" })).toBeInTheDocument();
  });

  it("thread shows replies signed by Gbam support, with a reply box", async () => {
    apiMock.helpTicket.mockResolvedValue(TICKET);
    render(await TicketPage({ params: Promise.resolve({ id: TICKET.id }) }));
    expect(screen.getByRole("heading", { name: /Payout missing/ })).toBeInTheDocument();
    expect(screen.getByText("We're checking with Paystack.").closest("li")).toHaveTextContent(
      "Gbam support",
    );
    expect(screen.getByRole("textbox", { name: "Your reply" })).toBeInTheDocument();
  });

  it("a closed ticket says so instead of the reply box", async () => {
    apiMock.helpTicket.mockResolvedValue({ ...TICKET, status: "closed" });
    render(await TicketPage({ params: Promise.resolve({ id: TICKET.id }) }));
    expect(screen.queryByRole("textbox", { name: "Your reply" })).toBeNull();
    expect(screen.getByText(/This request is closed/)).toBeInTheDocument();
  });

  it("another shop's ticket is not found", async () => {
    apiMock.helpTicket.mockRejectedValue(new FakeApiError(404, {}));
    await expect(TicketPage({ params: Promise.resolve({ id: TICKET.id }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("help actions", () => {
  it("new ticket form validates and opens", async () => {
    const short = await openTicketAction({}, form({ subject: "Hi", message: "short" }));
    expect(short.fieldErrors?.subject).toBe("Write a short subject");
    expect(apiMock.openHelpTicket).not.toHaveBeenCalled();

    apiMock.openHelpTicket.mockResolvedValue({ id: TICKET.id, number: 1042 });
    await expect(
      openTicketAction(
        {},
        form({ subject: "Payout missing", message: "Nothing came to my bank.", orderCode: "" }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/help/${TICKET.id}`);
    expect(apiMock.openHelpTicket).toHaveBeenCalledWith({
      subject: "Payout missing",
      message: "Nothing came to my bank.",
      orderCode: undefined,
    });
  });

  it("an order code that isn't theirs is shown on the field", async () => {
    apiMock.openHelpTicket.mockRejectedValue(
      new FakeApiError(400, {
        message: "There's no order with that code in your shop",
        field: "orderCode",
      }),
    );
    const state = await openTicketAction(
      {},
      form({
        subject: "Payout missing",
        message: "Nothing came to my bank.",
        orderCode: "GB-7K2Q",
      }),
    );
    expect(state.fieldErrors?.orderCode).toBe("There's no order with that code in your shop");
  });

  it("a reply is sent and the thread refreshed", async () => {
    apiMock.replyHelpTicket.mockResolvedValue({ ok: true });
    const state = await replyTicketAction(TICKET.id, {}, form({ message: "Thanks!" }));
    expect(apiMock.replyHelpTicket).toHaveBeenCalledWith(TICKET.id, "Thanks!");
    expect(refresh).toHaveBeenCalled();
    expect(state.error).toBeUndefined();
  });

  it("ask Gbam escalates", async () => {
    apiMock.escalateOrderIssue.mockResolvedValue({ id: TICKET.id, number: 1042 });
    const state = await escalateIssueAction(
      "o1",
      "i1",
      {},
      form({ message: "Courier says delivered." }),
    );
    expect(apiMock.escalateOrderIssue).toHaveBeenCalledWith("o1", "i1", "Courier says delivered.");
    expect(state.ticketId).toBe(TICKET.id);
  });
});

describe("public ticket page", () => {
  it("public page needs the key", async () => {
    await expect(
      PublicTicketPage({
        params: Promise.resolve({ id: TICKET.id }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    apiMock.publicTicket.mockRejectedValue(new FakeApiError(404, {}));
    await expect(
      PublicTicketPage({
        params: Promise.resolve({ id: TICKET.id }),
        searchParams: Promise.resolve({ k: "wrong" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("with the key, shows the thread and a reply box", async () => {
    apiMock.publicTicket.mockResolvedValue(TICKET);
    render(
      await PublicTicketPage({
        params: Promise.resolve({ id: TICKET.id }),
        searchParams: Promise.resolve({ k: "secret" }),
      }),
    );
    expect(apiMock.publicTicket).toHaveBeenCalledWith(TICKET.id, "secret");
    expect(screen.getByText("We're checking with Paystack.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your reply" })).toBeInTheDocument();
  });

  it("a public reply goes through with the key", async () => {
    apiMock.replyPublicTicket.mockResolvedValue({ ok: true });
    await publicReplyAction(TICKET.id, "secret", {}, form({ message: "Any news?" }));
    expect(apiMock.replyPublicTicket).toHaveBeenCalledWith(TICKET.id, "secret", "Any news?");
  });
});
