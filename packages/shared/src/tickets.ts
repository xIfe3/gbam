import { z } from "zod";
import { orderCodeSchema } from "./schemas";

/** Open → waiting (on the person who asked) → solved → closed. */
export const TICKET_STATUSES = ["open", "waiting", "solved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["low", "normal", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/** Where a ticket came from: the contact form, a seller's "Get help", or a customer problem. */
export const TICKET_SOURCES = ["contact", "seller", "problem_report"] as const;
export type TicketSource = (typeof TICKET_SOURCES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  waiting: "Waiting on them",
  solved: "Solved",
  closed: "Closed",
};

const messageText = z
  .string()
  .trim()
  .min(1, "Write a message")
  .max(5000, "Keep it under 5,000 characters");

/** "" (an empty form box) counts as no order code. */
const optionalOrderCode = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (value === "") {
      return undefined;
    }
    return value;
  })
  .pipe(orderCodeSchema.optional());

/** A seller's "Get help" form. */
export const newTicketSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(3, "Write a short subject")
    .max(120, "Keep the subject under 120 characters"),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more (at least 10 characters)")
    .max(5000, "Keep it under 5,000 characters"),
  orderCode: optionalOrderCode,
});
export type NewTicketInput = z.output<typeof newTicketSchema>;

/** A reply, from anyone, or an admin's internal note. */
export const ticketReplySchema = z.object({ message: messageText });
export type TicketReplyInput = z.output<typeof ticketReplySchema>;

/** An admin changing a ticket's status, priority or who it's assigned to (null = nobody). */
export const ticketUpdateSchema = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assigneeId: z.uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Change at least one thing");
export type TicketUpdateInput = z.output<typeof ticketUpdateSchema>;

export const TICKET_BULK_ACTIONS = ["assign", "status", "priority", "close", "delete"] as const;
export type TicketBulkAction = (typeof TICKET_BULK_ACTIONS)[number];

/** Bulk changes from the ticket list: up to 100 tickets, always with a note. */
export const ticketBulkSchema = z
  .object({
    ids: z
      .array(z.uuid())
      .min(1, "Pick at least one")
      .max(100, "At most 100 at a time")
      .refine((list) => new Set(list).size === list.length, "Each item only once"),
    note: z.string().trim().min(5, "Write a short note (at least 5 characters)").max(500),
    action: z.enum(TICKET_BULK_ACTIONS),
    assigneeId: z.uuid().nullable().optional(),
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
  })
  // Each action needs its value: assign → who (or null for nobody), status → which, ...
  .refine((value) => value.action !== "assign" || value.assigneeId !== undefined, {
    message: "Pick who to assign them to",
    path: ["assigneeId"],
  })
  .refine((value) => value.action !== "status" || value.status !== undefined, {
    message: "Pick a status",
    path: ["status"],
  })
  .refine((value) => value.action !== "priority" || value.priority !== undefined, {
    message: "Pick a priority",
    path: ["priority"],
  });
export type TicketBulkInput = z.output<typeof ticketBulkSchema>;
