import { TICKET_STATUS_LABELS } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton, ReasonForm } from "@/components/admin/action-forms";
import { adminCan } from "@/components/admin/admin-nav";
import { shortTime } from "@/components/admin/list-bits";
import { MessageForm, PRIORITY_LABELS, TicketSettingsForm } from "@/components/admin/ticket-forms";
import { adminApi, type AdminTicketDetail } from "@/lib/admin-api";
import {
  deleteTicketAction,
  restoreTicketAction,
  ticketNoteAction,
  ticketReplyAction,
  updateTicketAction,
} from "../../admin-actions";

export const metadata: Metadata = { title: "Ticket · Admin" };

type Message = AdminTicketDetail["messages"][number];

/** Who wrote a message, as admins see it. */
function authorLine(message: Message, requesterName: string): string {
  if (message.author === "requester") {
    return requesterName;
  }
  if (message.author === "system") {
    return "Gbam (automatic)";
  }
  let name = "An admin";
  if (message.adminName) {
    name = message.adminName;
  }
  if (message.internal) {
    return `Internal note · ${name}`;
  }
  return `${name} (reply)`;
}

/** One ticket: the conversation with notes, reply and note forms, and its settings. */
export default async function TicketDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const me = await adminApi.me();
  const canHandle = adminCan(me, "tickets.handle");
  const detail = await adminApi.ticket(id);
  const ticket = detail.ticket;
  const inBin = ticket.deletedAt !== null;

  let assignees: { id: string; name: string }[] = [];
  if (canHandle) {
    assignees = await adminApi.ticketAssignees();
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/tickets" className="text-sm font-bold underline">
        ← All tickets
      </Link>
      <div>
        <h1 className="font-display text-ink text-3xl font-black">
          {ticket.subject} <span className="text-ink-muted text-xl">#{ticket.number}</span>
        </h1>
        <p className="text-ink-muted mt-1 text-sm">
          {TICKET_STATUS_LABELS[ticket.status]} · {PRIORITY_LABELS[ticket.priority]} priority ·
          opened {shortTime(ticket.createdAt)}
          {inBin && " · in the bin"}
        </p>
      </div>

      <dl className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-ink-muted">From</dt>
          <dd className="font-bold">
            {ticket.requesterName} · {ticket.requesterEmail}
          </dd>
        </div>
        {detail.shop && (
          <div>
            <dt className="text-ink-muted">Shop</dt>
            <dd>
              <Link href={`/admin/shops/${detail.shop.id}`} className="font-bold underline">
                {detail.shop.businessName}
              </Link>
            </dd>
          </div>
        )}
        {detail.order && (
          <div>
            <dt className="text-ink-muted">Order</dt>
            <dd>
              <Link href={`/admin/orders/${detail.order.id}`} className="font-bold underline">
                {detail.order.code}
              </Link>
            </dd>
          </div>
        )}
        <div>
          <dt className="text-ink-muted">Assigned to</dt>
          <dd className="font-bold">{detail.assigneeName ?? "Nobody"}</dd>
        </div>
      </dl>

      <ol className="space-y-3">
        {detail.messages.map((message) => {
          let classes = "rounded-xl border border-zinc-200 bg-white p-4";
          if (message.internal) {
            classes = "rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4";
          } else if (message.author === "admin") {
            classes = "bg-brand-tint rounded-xl p-4";
          }
          return (
            <li key={message.id} className={classes}>
              <p className="text-sm font-bold">
                {authorLine(message, ticket.requesterName)}{" "}
                <span className="text-ink-muted font-normal">· {shortTime(message.createdAt)}</span>
              </p>
              <p className="mt-1 whitespace-pre-line">{message.body}</p>
            </li>
          );
        })}
      </ol>

      {canHandle && !inBin && (
        <>
          <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
            <MessageForm
              action={ticketReplyAction.bind(null, ticket.id)}
              label={`Reply to ${ticket.requesterName}`}
              hint="They get it by email, with a link to read the whole conversation and reply."
              button="Send reply"
            />
          </section>
          <section className="space-y-4 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-5">
            <MessageForm
              action={ticketNoteAction.bind(null, ticket.id)}
              label="Internal note"
              hint="Only admins see notes. Nothing is emailed."
              button="Add note"
            />
          </section>
          <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="font-bold">Ticket settings</h2>
            <TicketSettingsForm
              action={updateTicketAction.bind(null, ticket.id)}
              status={ticket.status}
              priority={ticket.priority}
              assigneeId={ticket.assigneeId}
              assignees={assignees}
            />
          </section>
          <details className="rounded-xl border border-zinc-200 bg-white p-5">
            <summary className="cursor-pointer font-bold">Move to the bin</summary>
            <div className="mt-3">
              <ReasonForm
                action={deleteTicketAction.bind(null, ticket.id)}
                label="Move to the bin"
                pendingLabel="Moving…"
              />
            </div>
          </details>
        </>
      )}
      {canHandle && inBin && (
        <ActionButton
          action={restoreTicketAction.bind(null, ticket.id)}
          label="Restore from the bin"
        />
      )}
    </div>
  );
}
