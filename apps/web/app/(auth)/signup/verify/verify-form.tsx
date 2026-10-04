"use client";

import { useActionState } from "react";
import { CodeInput } from "@/components/brand/fields";
import { Button } from "@/components/brand/button";
import { FormError, FormNotice, SubmitButton } from "@/components/brand/form-bits";
import { resendCodeAction, verifyEmailAction } from "../actions";

export function VerifyForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(verifyEmailAction, {});
  const [resendState, resendAction, resending] = useActionState(resendCodeAction, {});

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <FormError message={state.error} />
        <CodeInput label={`6-digit code sent to ${email}`} error={state.fieldErrors?.code} />
        <SubmitButton pendingLabel="Checking…">Verify email</SubmitButton>
      </form>

      <form action={resendAction} className="flex flex-col items-start gap-3">
        <FormError message={resendState.error} />
        <FormNotice message={resendState.notice} />
        <p className="text-ink-muted text-sm">
          Didn&apos;t get it? Check spam, or ask for a new one.
        </p>
        <Button variant="secondary" type="submit" disabled={resending}>
          {resending ? "Sending…" : "Resend code"}
        </Button>
      </form>
    </div>
  );
}
