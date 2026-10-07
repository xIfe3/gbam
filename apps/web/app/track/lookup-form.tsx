"use client";

import { useActionState } from "react";
import { TextField } from "@/components/brand/fields";
import { FormError, SubmitButton } from "@/components/brand/form-bits";
import { lookupAction, type LookupState } from "./actions";

/** Order code + last 4 digits of the phone used to order. */
export function LookupForm() {
  const [state, formAction] = useActionState<LookupState, FormData>(lookupAction, {});
  return (
    <section
      aria-labelledby="lookup-heading"
      className="border-brand-tint flex flex-col gap-4 rounded-2xl border-2 bg-white p-5"
    >
      <h2 id="lookup-heading" className="text-ink font-bold">
        Find an order
      </h2>
      {/* onReset preventDefault: keep what they typed after a failed search. */}
      <form
        action={formAction}
        onReset={(event) => event.preventDefault()}
        className="flex flex-col gap-4"
      >
        <FormError message={state.error} />
        <TextField
          label="Order code"
          name="code"
          placeholder="GB-7B2Q"
          autoCapitalize="characters"
          autoComplete="off"
          defaultValue={state.values?.code}
          hint="It's in your order confirmation and WhatsApp messages."
        />
        <TextField
          label="Last 4 digits of your phone number"
          name="phoneLast4"
          inputMode="numeric"
          maxLength={4}
          placeholder="4567"
          autoComplete="off"
          defaultValue={state.values?.phoneLast4}
        />
        <SubmitButton pendingLabel="Finding your order…">Find my order</SubmitButton>
      </form>
    </section>
  );
}
