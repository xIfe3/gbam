"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/brand/form-bits";
import { PasswordField, TextField } from "@/components/brand/fields";
import { loginAction } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(loginAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
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
      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <Link
        href="/forgot-password"
        className="text-brand-hover focus-visible:outline-brand -mt-2 inline-flex min-h-11 items-center self-start rounded text-sm font-bold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Forgot your password?
      </Link>
      <SubmitButton pendingLabel="Logging in…">Log in</SubmitButton>
    </form>
  );
}
