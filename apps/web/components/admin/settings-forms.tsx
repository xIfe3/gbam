"use client";

import type { Maintenance, PlatformSettings } from "@gbam/shared";
import { useActionState } from "react";
import type { FormState } from "@/app/(auth)/action-helpers";
import { TextField } from "@/components/brand/fields";
import { FormError, FormNotice, SubmitButton } from "@/components/brand/form-bits";

type FormAction = (previous: FormState, formData: FormData) => Promise<FormState>;

/** Admin → Settings: every value in one form, saved together. */
export function SettingsForm({
  action,
  settings,
}: {
  action: FormAction;
  settings: PlatformSettings;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <FormError message={state.error} />
      <FormNotice message={state.notice} />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Gbam fee</legend>
        <TextField
          label="Fee (%)"
          name="feePercent"
          inputMode="decimal"
          defaultValue={String(settings.feePercentBasisPoints / 100)}
          hint="Applies to payment links made from now on."
          error={errors.feePercent}
        />
        <TextField
          label="Most per order (₦)"
          name="feeCapNaira"
          inputMode="numeric"
          defaultValue={String(settings.feeCapKobo / 100)}
          error={errors.feeCapNaira}
        />
        <TextField
          label="Founding-seller waiver (days)"
          name="foundingWaiverDays"
          inputMode="numeric"
          defaultValue={String(settings.foundingWaiverDays)}
          hint="Pre-fills the waiver date on a shop's page."
          error={errors.foundingWaiverDays}
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Unpaid orders</legend>
        <TextField
          label="Reminder after (hours)"
          name="reminderAfterHours"
          inputMode="numeric"
          defaultValue={String(settings.reminderAfterHours)}
          error={errors.reminderAfterHours}
        />
        <TextField
          label="Cancel after (hours)"
          name="cancelAfterHours"
          inputMode="numeric"
          defaultValue={String(settings.cancelAfterHours)}
          error={errors.cancelAfterHours}
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Contact details</legend>
        <TextField
          label="Support email (refund alerts, tickets)"
          name="supportEmail"
          type="email"
          defaultValue={settings.supportEmail}
          error={errors.supportEmail}
        />
        <TextField
          label="Contact email (contact form)"
          name="contactEmail"
          type="email"
          defaultValue={settings.contactEmail}
          error={errors.contactEmail}
        />
        <TextField
          label="Privacy email (account deletions)"
          name="privacyEmail"
          type="email"
          defaultValue={settings.privacyEmail}
          error={errors.privacyEmail}
        />
        <TextField
          label="Gbam WhatsApp number"
          name="whatsappNumber"
          inputMode="tel"
          defaultValue={settings.whatsappNumber ?? ""}
          hint="Digits only, like 2348012345678. Empty hides it on the contact page."
          error={errors.whatsappNumber}
        />
      </fieldset>

      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          name="signupsOpen"
          defaultChecked={settings.signupsOpen}
          className="accent-brand size-5"
        />
        New sellers can sign up
      </label>

      <div>
        <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
      </div>
    </form>
  );
}

/** Maintenance mode (superadmin). Switching it on needs a tick to confirm. */
export function MaintenanceForm({
  action,
  maintenance,
}: {
  action: FormAction;
  maintenance: Maintenance;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  // A date-time box wants "2026-10-09T15:00" in Lagos time (UTC+1, no daylight saving).
  let backByValue = "";
  if (maintenance.backBy) {
    const lagos = new Date(new Date(maintenance.backBy).getTime() + 60 * 60 * 1000);
    backByValue = lagos.toISOString().slice(0, 16);
  }
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">Level</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="level"
            value="off"
            defaultChecked={maintenance.level === "off"}
            className="accent-brand size-5"
          />
          Off: the site works normally
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="level"
            value="pause"
            defaultChecked={maintenance.level === "pause"}
            className="accent-brand size-5"
          />
          Pause orders: shops stay visible, but no new orders, payments or seller sign-ins
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="level"
            value="full"
            defaultChecked={maintenance.level === "full"}
            className="accent-brand size-5"
          />
          Full: every page shows the maintenance page (the admin area still works)
        </label>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm font-bold">
        Message for visitors (optional)
        <textarea
          name="message"
          maxLength={300}
          defaultValue={maintenance.message ?? ""}
          className="min-h-16 rounded-lg border-2 border-zinc-200 p-2 font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold">
        Back by (Lagos time, optional)
        <input
          type="datetime-local"
          name="backBy"
          defaultValue={backByValue}
          className="min-h-11 rounded-lg border-2 border-zinc-200 px-2 font-normal"
        />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="confirmed" className="accent-brand size-5" />I understand
        visitors will see the maintenance page. Payments already made are still recorded.
      </label>
      {state.fieldErrors?.confirmed && (
        <p role="alert" className="text-coral-deep text-sm">
          {state.fieldErrors.confirmed}
        </p>
      )}
      <div>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}
