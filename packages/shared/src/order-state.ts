/**
 * The single source of truth for order lifecycle.
 * The API enforces it (assertTransition); the dashboard uses nextStatuses() to pick buttons.
 */

export const ORDER_STATUSES = [
  "pending",
  "awaiting_payment",
  "paid",
  "fulfilled",
  "delivered",
  "cancelled",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Who is attempting the transition. "system" = webhooks and background jobs. */
export type OrderActor = "seller" | "system";

type TransitionRule = { to: OrderStatus; actors: readonly OrderActor[] };

const ANYONE = ["seller", "system"] as const;
const SYSTEM_ONLY = ["system"] as const;

const TRANSITIONS: Record<OrderStatus, readonly TransitionRule[]> = {
  pending: [
    { to: "awaiting_payment", actors: ANYONE },
    { to: "cancelled", actors: ANYONE },
  ],
  awaiting_payment: [
    // Only a verified Paystack webhook may mark an order paid.
    { to: "paid", actors: SYSTEM_ONLY },
    { to: "cancelled", actors: ANYONE },
  ],
  paid: [
    { to: "fulfilled", actors: ANYONE },
    { to: "refunded", actors: ANYONE },
  ],
  fulfilled: [
    { to: "delivered", actors: ANYONE },
    { to: "refunded", actors: ANYONE },
  ],
  delivered: [{ to: "refunded", actors: ANYONE }],
  cancelled: [],
  refunded: [],
};

export function nextStatuses(from: OrderStatus, actor: OrderActor): OrderStatus[] {
  return TRANSITIONS[from].filter((rule) => rule.actors.includes(actor)).map((rule) => rule.to);
}

export function canTransition(from: OrderStatus, to: OrderStatus, actor: OrderActor): boolean {
  return nextStatuses(from, actor).includes(to);
}

export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export class InvalidOrderTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    readonly actor: OrderActor,
  ) {
    super(`Order cannot move from "${from}" to "${to}" (actor: ${actor})`);
    this.name = "InvalidOrderTransitionError";
  }
}

export function assertTransition(from: OrderStatus, to: OrderStatus, actor: OrderActor): void {
  if (!canTransition(from, to, actor)) {
    throw new InvalidOrderTransitionError(from, to, actor);
  }
}
