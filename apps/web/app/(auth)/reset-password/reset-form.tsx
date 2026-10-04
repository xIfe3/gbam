"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/brand/form-bits";
import { CodeInput, PasswordField } from "@/components/brand/fields";
import { resetPasswordAction } from "../actions";

type ResetFormProps = { email: string; requestId: string };

export function ResetForm({ email, requestId }: ResetFormProps) {
  const [state, formAction] = useActionState(resetPasswordAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="requestId" value={requestId} />
      <FormError message={state.error} />
      <CodeInput label="6-digit code" error={state.fieldErrors?.code} />
      <PasswordField
        label="New password"
        name="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Saving…">Set new password</SubmitButton>
    </form>
  );
}
