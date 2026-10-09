"use server";

import { newTicketSchema, ticketReplySchema } from "@gbam/shared";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  apiFieldError,
  failureMessage,
  fieldErrorsFrom,
  text,
  type FormState,
} from "@/app/(auth)/action-helpers";
import { api, ApiError } from "@/lib/api";

/** The API's message for a refused reply (e.g. "This request is closed..."), if it sent one. */
function refusedMessage(error: unknown): string | null {
  if (error instanceof ApiError && error.status === 409) {
    const body = error.body;
    if (typeof body === "object" && body !== null && "message" in body) {
      const message = body.message;
      if (typeof message === "string") {
        return message;
      }
    }
  }
  return null;
}

/** "Get help": opens a ticket, then shows it. */
export async function openTicketAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = {
    subject: text(formData, "subject"),
    message: text(formData, "message"),
    orderCode: text(formData, "orderCode"),
  };
  const input = newTicketSchema.safeParse(values);
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error), values };
  }

  let ticketId: string;
  try {
    const ticket = await api.openHelpTicket(input.data);
    ticketId = ticket.id;
  } catch (error) {
    const orderError = apiFieldError(error, "orderCode");
    if (orderError !== null) {
      return { fieldErrors: { orderCode: orderError }, values };
    }
    return { error: failureMessage(error, "open help ticket"), values };
  }
  // redirect() works by throwing, so it's outside the try/catch above.
  redirect(`/dashboard/help/${ticketId}`);
}

/** A seller's reply on their ticket. */
export async function replyTicketAction(
  ticketId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = ticketReplySchema.safeParse({ message: text(formData, "message") });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }
  try {
    await api.replyHelpTicket(ticketId, input.data.message);
  } catch (error) {
    const refused = refusedMessage(error);
    if (refused !== null) {
      return { error: refused };
    }
    return { error: failureMessage(error, "reply to help ticket") };
  }
  refresh();
  return { notice: "Sent. We'll email you when we reply." };
}

export type EscalateState = FormState & { ticketId?: string; number?: number };

/** "Ask Gbam to help" on a customer's problem report. */
export async function escalateIssueAction(
  orderId: string,
  issueId: string,
  _previous: EscalateState,
  formData: FormData,
): Promise<EscalateState> {
  const input = ticketReplySchema.safeParse({ message: text(formData, "message") });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }
  try {
    const ticket = await api.escalateOrderIssue(orderId, issueId, input.data.message);
    return { ticketId: ticket.id, number: ticket.number };
  } catch (error) {
    return { error: failureMessage(error, "escalate order issue") };
  }
}

/** A reply on the public ticket link (contact-form tickets), using the key from the link. */
export async function publicReplyAction(
  ticketId: string,
  key: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = ticketReplySchema.safeParse({ message: text(formData, "message") });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }
  try {
    await api.replyPublicTicket(ticketId, key, input.data.message);
  } catch (error) {
    const refused = refusedMessage(error);
    if (refused !== null) {
      return { error: refused };
    }
    return { error: failureMessage(error, "reply to ticket") };
  }
  refresh();
  return { notice: "Sent. We'll email you when we reply." };
}
