"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/app/(auth)/action-helpers";
import { TextField } from "@/components/brand/fields";
import { FormError, SubmitButton } from "@/components/brand/form-bits";
import { openTicketAction } from "./actions";

/** "Get help": a subject, what's wrong, and optionally which order it's about. */
export function NewTicketForm() {
  const [state, formAction] = useActionState<FormState, FormData>(openTicketAction, {});
  const messageId = useId();
  const values = state.values ?? {};
  return (
    // onReset preventDefault: React clears a form after its action runs; keep what they typed.
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      className="flex flex-col gap-4"
      noValidate
    >
      <FormError message={state.error} />
      <TextField
        label="Subject"
        name="subject"
        maxLength={120}
        defaultValue={values.subject}
        required
        error={state.fieldErrors?.subject}
      />
      <div className="flex flex-col gap-2">
        <label htmlFor={messageId} className="text-ink text-sm font-bold">
          What do you need help with?
        </label>
        <textarea
          id={messageId}
          name="message"
          rows={5}
          maxLength={5000}
          defaultValue={values.message}
          required
          aria-invalid={state.fieldErrors?.message !== undefined}
          className="text-ink border-brand-tint focus-visible:outline-brand w-full rounded-xl border-2 bg-white px-4 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        {state.fieldErrors?.message && (
          <p className="text-coral-deep text-sm">{state.fieldErrors.message}</p>
        )}
      </div>
      <TextField
        label="Order code (optional)"
        name="orderCode"
        placeholder="GB-7K2Q"
        defaultValue={values.orderCode}
        hint="If it's about one order, add its code so we can look it up."
        error={state.fieldErrors?.orderCode}
      />
      <SubmitButton pendingLabel="Sending…">Send to Gbam</SubmitButton>
    </form>
  );
}
