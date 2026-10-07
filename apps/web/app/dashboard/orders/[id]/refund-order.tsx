"use client";

import { formatNaira } from "@gbam/shared";
import { useActionState } from "react";
import { CopyLinkButton } from "../../copy-link-button";
import { updateOrderStatus, type UpdateStatusState } from "../../actions";

/**
 * How to give a customer their money back, then "Mark refunded".
 * The card payment went through Gbam's Paystack account (your share was split to you), so
 * sellers can't reverse it themselves yet: either send the money back by transfer, or ask us
 * with the payment reference. Marking it refunded tells the customer on WhatsApp.
 */
export function RefundOrder({
  orderId,
  reference,
  amountKobo,
}: {
  orderId: string;
  reference: string;
  amountKobo: number;
}) {
  const [state, formAction, pending] = useActionState<UpdateStatusState, FormData>(
    updateOrderStatus,
    {},
  );
  const mailSubject = encodeURIComponent(`Refund request ${reference}`);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold">Refund the customer</h3>
        <p className="text-sm text-zinc-500">
          They paid {formatNaira(amountKobo)}. Give it back first, then mark it refunded.
        </p>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
        <li>
          <strong>Quickest:</strong> send the money back to the customer by bank transfer.
        </li>
        <li>
          <strong>Or</strong> email{" "}
          <a
            href={`mailto:support@gbam.app?subject=${mailSubject}`}
            className="text-brand-hover font-medium underline"
          >
            support@gbam.app
          </a>{" "}
          with the payment reference below. We reverse the card payment through Paystack (it
          can take a few working days to reach the customer).
        </li>
        <li>Come back and press &quot;Mark refunded&quot;.</li>
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-zinc-100 px-2 py-1 text-sm break-all">{reference}</code>
        <CopyLinkButton url={reference} label="Copy reference" />
      </div>

      <form action={formAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <button
          type="submit"
          name="status"
          value="refunded"
          disabled={pending}
          className="min-h-11 rounded-lg border border-rose-300 px-4 py-2 font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          Mark refunded
        </button>
      </form>
      {state.error && (
        <p role="alert" className="text-sm text-rose-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
