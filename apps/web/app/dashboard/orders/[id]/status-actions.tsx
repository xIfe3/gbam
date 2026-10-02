"use client";

import type { OrderStatus } from "@gbam/shared";
import { useActionState } from "react";
import { ACTION_LABEL, DESTRUCTIVE } from "@/lib/order-labels";
import { updateOrderStatus, type UpdateStatusState } from "../../actions";

/** One button per status the shared state machine allows a seller to move to. */
export function StatusActions({ orderId, allowed }: { orderId: string; allowed: OrderStatus[] }) {
  const [state, formAction, pending] = useActionState<UpdateStatusState, FormData>(
    updateOrderStatus,
    {},
  );

  if (allowed.length === 0) {
    return <p className="text-sm text-zinc-500">This order is closed. No further actions.</p>;
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex flex-wrap gap-2">
        {allowed.map((status) => (
          <button
            key={status}
            type="submit"
            name="status"
            value={status}
            disabled={pending}
            className={
              DESTRUCTIVE.has(status)
                ? "rounded-lg border border-rose-300 px-4 py-2 font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                : "rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            }
          >
            {ACTION_LABEL[status]}
          </button>
        ))}
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-rose-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
