import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { ReplyForm } from "@/components/help/reply-form";
import { REQUESTER_STATUS, TicketThread } from "@/components/help/ticket-thread";
import { api, ApiError, type HelpTicket } from "@/lib/api";
import { replyTicketAction } from "../actions";

export const metadata: Metadata = { title: "Help request" };

/** One of the seller's requests: the conversation with Gbam support and a reply box. */
export default async function TicketPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  let ticket: HelpTicket;
  try {
    ticket = await api.helpTicket(id);
  } catch (error) {
    unstable_rethrow(error);
    // 404 also covers another shop's ticket: no hint that it exists.
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/help" className="text-brand-hover text-sm font-bold">
        ← All help requests
      </Link>
      <div>
        <h1 className="font-display text-ink text-2xl font-black">
          {ticket.subject}{" "}
          <span className="text-ink-muted text-lg font-bold">#{ticket.number}</span>
        </h1>
        <p className="text-ink-muted text-sm">{REQUESTER_STATUS[ticket.status]}</p>
      </div>
      <TicketThread messages={ticket.messages} />
      {ticket.status === "closed" && (
        <p className="text-ink-muted rounded-xl bg-white p-4 text-sm">
          This request is closed. If you still need help,{" "}
          <Link href="/dashboard/help" className="text-brand-hover font-bold underline">
            ask a new question
          </Link>
          .
        </p>
      )}
      {ticket.status !== "closed" && (
        <div className="rounded-2xl bg-white p-5">
          <ReplyForm action={replyTicketAction.bind(null, ticket.id)} />
        </div>
      )}
    </div>
  );
}
