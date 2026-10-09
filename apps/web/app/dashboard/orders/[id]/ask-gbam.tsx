"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { FormError, SubmitButton } from "@/components/brand/form-bits";
import { escalateIssueAction, type EscalateState } from "@/app/dashboard/help/actions";

/**
 * "Ask Gbam to help" under a customer's problem: the seller says what they've tried, and it
 * becomes a help request linked to this order. Asking again opens the same request.
 */
export function AskGbam({ orderId, issueId }: { orderId: string; issueId: string }) {
  const [state, formAction] = useActionState<EscalateState, FormData>(
    escalateIssueAction.bind(null, orderId, issueId),
    {},
  );
  const boxId = useId();

  if (state.ticketId) {
    return (
      <p className="text-brand-hover mt-2 text-sm font-bold">
        ✓ Sent to Gbam as request #{state.number}.{" "}
        <Link href={`/dashboard/help/${state.ticketId}`} className="underline">
          Open it
        </Link>
      </p>
    );
  }

  return (
    <details className="mt-2">
      <summary className="text-brand-hover min-h-11 cursor-pointer content-center text-sm font-bold">
        Ask Gbam to help
      </summary>
      <form action={formAction} className="mt-2 flex flex-col gap-2">
        <FormError message={state.error} />
        <label htmlFor={boxId} className="text-ink text-sm font-bold">
          What happened on your side?
        </label>
        <textarea
          id={boxId}
          name="message"
          rows={3}
          maxLength={5000}
          required
          className="text-ink border-brand-tint focus-visible:outline-brand w-full rounded-xl border-2 bg-white px-4 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        {state.fieldErrors?.message && (
          <p className="text-coral-deep text-sm">{state.fieldErrors.message}</p>
        )}
        <SubmitButton pendingLabel="Sending…">Send to Gbam</SubmitButton>
      </form>
    </details>
  );
}
