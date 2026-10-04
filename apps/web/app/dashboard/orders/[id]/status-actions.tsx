"use client";

import type { OrderStatus } from "@gbam/shared";
import Link from "next/link";
import { useActionState, useId } from "react";
import { ACTION_LABEL, DESTRUCTIVE } from "@/lib/order-labels";
import { updateOrderStatus, type UpdateStatusState } from "../../actions";

const NEEDS_BANK_ACCOUNT = "Add your bank account to start receiving payments.";

/**
 * One button per status the shared state machine allows a seller to move to.
 * "Request payment" stays disabled until the seller has a payout account (the API refuses
 * it too, with PAYOUT_ACCOUNT_REQUIRED).
 */
export function StatusActions({
  orderId,
  allowed,
  canRequestPayment,
}: {
  orderId: string;
  allowed: OrderStatus[];
  canRequestPayment: boolean;
}) {
  const [state, formAction, pending] = useActionState<UpdateStatusState, FormData>(
    updateOrderStatus,
    {},
  );
  const reasonId = useId();

  if (allowed.length === 0) {
    return <p className="text-sm text-zinc-500">This order is closed. No further actions.</p>;
  }

  const paymentBlocked = allowed.includes("awaiting_payment") && !canRequestPayment;

  const buttons = [];
  for (const status of allowed) {
    let className =
      "rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-hover disabled:opacity-50";
    if (DESTRUCTIVE.has(status)) {
      className =
        "rounded-lg border border-rose-300 px-4 py-2 font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50";
    }
    let disabled = pending;
    let describedBy: string | undefined = undefined;
    if (status === "awaiting_payment" && paymentBlocked) {
      disabled = true;
      describedBy = reasonId; // screen readers hear why it is disabled
    }
    buttons.push(
      <button
        key={status}
        type="submit"
        name="status"
        value={status}
        disabled={disabled}
        aria-describedby={describedBy}
        className={className}
      >
        {ACTION_LABEL[status]}
      </button>,
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex flex-wrap gap-2">{buttons}</div>
      {paymentBlocked && (
        <p className="text-ink-muted text-sm">
          <span id={reasonId}>{NEEDS_BANK_ACCOUNT}</span>{" "}
          <Link
            href="/signup/get-paid"
            className="text-brand-hover focus-visible:outline-brand inline-flex min-h-11 items-center rounded font-bold underline focus-visible:outline-2"
          >
            Add bank account
          </Link>
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-rose-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
