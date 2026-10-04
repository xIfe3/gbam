"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/brand/form-bits";
import { TextField } from "@/components/brand/fields";
import { forgotPasswordAction } from "../actions";

export function ForgotForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <SubmitButton pendingLabel="Sending…">Send me a code</SubmitButton>
    </form>
  );
}
