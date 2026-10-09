import type { TicketStatus } from "@gbam/shared";
import type { HelpTicket } from "@/lib/api";

/** Status words for the person who asked (admins see their own wording). */
export const REQUESTER_STATUS: Record<TicketStatus, string> = {
  open: "Waiting for Gbam",
  waiting: "We replied",
  solved: "Solved",
  closed: "Closed",
};

function formatWhen(iso: string): string {
  // Lagos time, whatever timezone the server runs in.
  return new Date(iso).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  });
}

function authorLabel(author: HelpTicket["messages"][number]["author"]): string {
  if (author === "requester") {
    return "You";
  }
  if (author === "admin") {
    return "Gbam support";
  }
  return "Gbam";
}

/** The conversation, oldest first. Gbam's messages sit on a tinted background. */
export function TicketThread({ messages }: { messages: HelpTicket["messages"] }) {
  return (
    <ol className="flex flex-col gap-3">
      {messages.map((message) => {
        let classes = "rounded-xl border-2 border-zinc-100 bg-white p-4";
        if (message.author !== "requester") {
          classes = "bg-brand-tint rounded-xl p-4";
        }
        return (
          <li key={message.id} className={classes}>
            <p className="text-ink text-sm font-bold">
              {authorLabel(message.author)}{" "}
              <span className="text-ink-muted font-normal">· {formatWhen(message.createdAt)}</span>
            </p>
            {/* whitespace-pre-line keeps the writer's line breaks. */}
            <p className="text-ink mt-1 whitespace-pre-line">{message.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
