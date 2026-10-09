import type { Metadata } from "next";
import Link from "next/link";
import { REQUESTER_STATUS } from "@/components/help/ticket-thread";
import { api } from "@/lib/api";
import { NewTicketForm } from "./new-ticket-form";

export const metadata: Metadata = { title: "Help" };

/** The seller's requests to Gbam support, and a form to start a new one. */
export default async function HelpPage() {
  const tickets = await api.helpTickets();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="font-display text-ink text-2xl font-black">Help</h1>
        <p className="text-ink-muted">
          Ask Gbam support anything about your shop, payments or payouts. We reply here and by
          email, usually within one working day.
        </p>
        {tickets.length === 0 && (
          <p className="text-ink-muted text-sm">You haven&apos;t asked us anything yet.</p>
        )}
        {tickets.length > 0 && (
          <ul className="flex flex-col gap-2">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/dashboard/help/${ticket.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-zinc-100 bg-white p-4 hover:border-zinc-200"
                >
                  <span className="text-ink font-bold">
                    {ticket.subject}{" "}
                    <span className="text-ink-muted font-normal">#{ticket.number}</span>
                  </span>
                  <span className="text-ink-muted text-sm">{REQUESTER_STATUS[ticket.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-5">
        <h2 className="text-ink text-lg font-bold">Ask for help</h2>
        <NewTicketForm />
      </section>
    </div>
  );
}
