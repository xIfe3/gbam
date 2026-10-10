"use client";

import { useActionState } from "react";
import { PasswordField, TextField } from "@/components/brand/fields";
import { FormError, FormNotice, SubmitButton } from "@/components/brand/form-bits";
import type { FormState } from "@/app/(auth)/action-helpers";
import {
  changePasswordAction,
  closeAccountAction,
  updateEmailsAction,
  updateShopAction,
} from "./actions";

/** Shop name and WhatsApp number. */
export function ShopForm({ businessName, phone }: { businessName: string; phone: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(updateShopAction, {});
  // After a submit, show what was sent (React resets the form); before that, what's saved.
  let nameValue = businessName;
  let phoneValue = phone;
  if (state.values && state.values.businessName !== undefined) {
    nameValue = state.values.businessName;
  }
  if (state.values && state.values.phone !== undefined) {
    phoneValue = state.values.phone;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      {/* key: a new value from the server replaces what's in the box. */}
      <TextField
        key={`name-${nameValue}`}
        label="Shop name"
        name="businessName"
        defaultValue={nameValue}
        autoComplete="organization"
        error={state.fieldErrors?.businessName}
      />
      <TextField
        key={`phone-${phoneValue}`}
        label="WhatsApp number"
        name="phone"
        type="tel"
        inputMode="tel"
        defaultValue={phoneValue}
        autoComplete="tel"
        hint="Customers' order messages and your notifications use this number."
        error={state.fieldErrors?.phone}
      />
      <div>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}

/**
 * Optional emails. Payment, password and bank-account emails always go out (they're about
 * money and safety); only "new order" emails and Gbam's news and tips can be turned off.
 */
export function EmailsForm({
  newOrderEmails,
  newsEmails,
}: {
  newOrderEmails: boolean;
  newsEmails: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(updateEmailsAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700">
        <input
          type="checkbox"
          name="newOrderEmails"
          defaultChecked={newOrderEmails}
          className="accent-brand size-5"
        />
        Email me when a new order comes in
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700">
        <input
          type="checkbox"
          name="newsEmails"
          defaultChecked={newsEmails}
          className="accent-brand size-5"
        />
        Send me news and tips from Gbam (new features, a few times a month at most)
      </label>
      <div>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}

/** Change password: the current one first, so someone at an unlocked phone can't. */
export function PasswordForm() {
  const [state, formAction] = useActionState<FormState, FormData>(changePasswordAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <PasswordField
        label="Current password"
        name="currentPassword"
        autoComplete="current-password"
        error={state.fieldErrors?.currentPassword}
      />
      <PasswordField
        label="New password"
        name="newPassword"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={state.fieldErrors?.newPassword}
      />
      <div>
        <SubmitButton pendingLabel="Changing…">Change password</SubmitButton>
      </div>
    </form>
  );
}

/** Delete my account. Typing the shop's name makes it a deliberate act, not a slip. */
export function CloseAccountForm({ businessName }: { businessName: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(closeAccountAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <TextField
        label={`Type your shop name (${businessName}) to confirm`}
        name="businessName"
        autoComplete="off"
        defaultValue={state.values?.businessName}
        error={state.fieldErrors?.businessName}
      />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
      />
      <div>
        <button
          type="submit"
          className="min-h-11 rounded-full border-2 border-rose-300 px-5 font-bold text-rose-700 hover:bg-rose-50"
        >
          Delete my account
        </button>
      </div>
    </form>
  );
}
