"use client";

import { ISSUE_REASONS, ISSUE_REASON_LABEL } from "@gbam/shared";
import { useActionState, useId } from "react";
import { FormError, FormNotice, SubmitButton } from "@/components/brand/form-bits";
import { reportIssueAction, type ReportState } from "../actions";

/** "Report a problem": pick what went wrong, add a short note, and the seller is told. */
export function ReportIssueForm({ code, trackingKey }: { code: string; trackingKey: string }) {
  const [state, formAction] = useActionState<ReportState, FormData>(
    reportIssueAction.bind(null, code, trackingKey),
    {},
  );
  const noteId = useId();

  if (state.done) {
    return (
      <FormNotice message="Thanks. We've told the seller; they'll get back to you on WhatsApp." />
    );
  }

  return (
    <details className="border-brand-tint rounded-2xl border-2 bg-white p-4">
      <summary className="text-ink focus-visible:outline-brand min-h-11 cursor-pointer content-center font-bold focus-visible:outline-2">
        Report a problem
      </summary>
      {/* onReset preventDefault: React clears a form after its action runs; keep what they typed. */}
      <form
        action={formAction}
        onReset={(event) => event.preventDefault()}
        className="mt-3 flex flex-col gap-3"
      >
        <FormError message={state.error} />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-ink mb-1 text-sm font-bold">What went wrong?</legend>
          {ISSUE_REASONS.map((reason) => (
            <label
              key={reason}
              className="border-brand-tint has-checked:border-brand has-checked:bg-brand-tint flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 text-sm"
            >
              <input type="radio" name="reason" value={reason} className="accent-brand size-4" />
              {ISSUE_REASON_LABEL[reason]}
            </label>
          ))}
        </fieldset>
        <label htmlFor={noteId} className="text-ink text-sm font-bold">
          Anything else? (optional)
        </label>
        <textarea
          id={noteId}
          name="note"
          rows={3}
          maxLength={500}
          className="text-ink border-brand-tint focus-visible:outline-brand w-full rounded-xl border-2 bg-white px-4 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <SubmitButton pendingLabel="Sending…">Send to the seller</SubmitButton>
      </form>
    </details>
  );
}
