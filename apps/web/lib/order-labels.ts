import type { OrderStatus } from "@gbam/shared";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "New",
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  fulfilled: "Ready / sent out",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const STATUS_STYLE: Record<OrderStatus, string> = {
  pending: "bg-sky-100 text-sky-800",
  awaiting_payment: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  fulfilled: "bg-violet-100 text-violet-800",
  delivered: "bg-zinc-200 text-zinc-800",
  cancelled: "bg-zinc-100 text-zinc-500",
  refunded: "bg-rose-100 text-rose-800",
};

/** Button text for moving an order *to* a status. Buttons come from nextStatuses(). */
export const ACTION_LABEL: Record<OrderStatus, string> = {
  pending: "Reopen",
  awaiting_payment: "Request payment",
  paid: "Mark paid",
  fulfilled: "Mark ready / sent",
  delivered: "Mark delivered",
  cancelled: "Cancel order",
  refunded: "Refund",
};

export const DESTRUCTIVE: ReadonlySet<OrderStatus> = new Set(["cancelled", "refunded"]);
