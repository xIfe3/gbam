"use client";

import { useActionState } from "react";
import { PasswordField, TextField } from "@/components/brand/fields";
import { FormError, SubmitButton } from "@/components/brand/form-bits";
import { acceptInviteAction, type AcceptInviteState } from "./actions";
import { BackupCodes } from "./backup-codes";

/** Password + first code. After it works, the backup codes replace the form. */
export function AcceptInviteForm({ token }: { token: string }) {
  // bind: the server action receives the invite token as its first argument.
  const [state, formAction] = useActionState<AcceptInviteState, FormData>(
    acceptInviteAction.bind(null, token),
    {},
  );

  if (state.backupCodes) {
    return <BackupCodes codes={state.backupCodes} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <PasswordField
        label="Choose a password"
        name="password"
        autoComplete="new-password"
        hint="At least 12 characters."
        required
        error={state.fieldErrors?.password}
      />
      <TextField
        label="6-digit code from your app"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        error={state.fieldErrors?.code}
      />
      <SubmitButton pendingLabel="Setting up…">Finish setting up</SubmitButton>
    </form>
  );
}
