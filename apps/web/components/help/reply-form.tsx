"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/app/(auth)/action-helpers";
import { FormError, FormNotice, SubmitButton } from "@/components/brand/form-bits";

/** A reply box under a ticket thread. `action` already knows which ticket (bind). */
export function ReplyForm({
  action,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const boxId = useId();
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <label htmlFor={boxId} className="text-ink text-sm font-bold">
        Your reply
      </label>
      <textarea
        id={boxId}
        name="message"
        rows={4}
        maxLength={5000}
        required
        aria-invalid={state.fieldErrors?.message !== undefined}
        className="text-ink border-brand-tint focus-visible:outline-brand w-full rounded-xl border-2 bg-white px-4 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      {state.fieldErrors?.message && (
        <p className="text-coral-deep text-sm">{state.fieldErrors.message}</p>
      )}
      <SubmitButton pendingLabel="Sending…">Send reply</SubmitButton>
    </form>
  );
}
