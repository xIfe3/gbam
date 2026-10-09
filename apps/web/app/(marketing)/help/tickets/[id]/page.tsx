import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { ReplyForm } from "@/components/help/reply-form";
import { REQUESTER_STATUS, TicketThread } from "@/components/help/ticket-thread";
import { publicReplyAction } from "@/app/dashboard/help/actions";
import { api, ApiError, type HelpTicket } from "@/lib/api";

// Private page: keep it out of search results.
// no-referrer: the private key in this page's address is never passed to other sites.
export const metadata: Metadata = {
  title: "Your message to Gbam",
  robots: { index: false },
  referrer: "no-referrer",
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * /help/tickets/:id?k=…: the conversation for someone who used the contact form. There's no
 * account; the long random key in the emailed link is what opens it.
 */
export default async function PublicTicketPage(props: Props) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const key = searchParams.k;
  if (typeof key !== "string" || key === "") {
    notFound();
  }

  let ticket: HelpTicket;
  try {
    ticket = await api.publicTicket(id, key);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-10">
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
          This conversation is closed. If you still need help,{" "}
          <Link href="/contact" className="text-brand-hover font-bold underline">
            send us a new message
          </Link>
          .
        </p>
      )}
      {ticket.status !== "closed" && (
        <div className="rounded-2xl bg-white p-5">
          <ReplyForm action={publicReplyAction.bind(null, ticket.id, key)} />
        </div>
      )}
    </main>
  );
}
