"use client";

import { useActionState } from "react";
import { PasswordField, TextField } from "@/components/brand/fields";
import { FormError, SubmitButton } from "@/components/brand/form-bits";
import { adminLoginAction, type AdminLoginState } from "./actions";

/** Step 1: email + password. Step 2 (same form, same page): the code from the app. */
export function AdminLoginForm() {
  const [state, formAction] = useActionState<AdminLoginState, FormData>(adminLoginAction, {
    step: "password",
  });

  if (state.step === "code") {
    return (
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="challengeToken" value={state.challengeToken ?? ""} />
        <FormError message={state.error} />
        <p className="text-ink-muted text-sm">
          Open your authenticator app and type the 6-digit code for Gbam Admin. Lost your phone?
          Type one of your backup codes instead.
        </p>
        <TextField
          label="Code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          error={state.fieldErrors?.code}
        />
        <SubmitButton pendingLabel="Checking…">Sign in</SubmitButton>
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.email}
        error={state.fieldErrors?.email}
      />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Checking…">Continue</SubmitButton>
    </form>
  );
}
