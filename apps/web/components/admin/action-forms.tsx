"use client";

import { useActionState, useState, useTransition } from "react";
import type { FormState } from "@/app/(auth)/action-helpers";
import { FormError, FormNotice, SubmitButton } from "@/components/brand/form-bits";

type FormAction = (previous: FormState, formData: FormData) => Promise<FormState>;

const boxClasses = "min-h-16 w-full rounded-lg border-2 border-zinc-200 p-2 text-base";

/**
 * A small form for actions that need a reason (suspend, reopen, resolve...). The reason goes
 * in the audit log. `tick` adds a checkbox that must be ticked first (e.g. "the money is back
 * with the customer").
 */
export function ReasonForm({
  action,
  label,
  pendingLabel,
  reasonLabel = "Reason (for the audit log)",
  tick,
}: {
  action: FormAction;
  label: string;
  pendingLabel: string;
  reasonLabel?: string;
  tick?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <label className="flex flex-col gap-1 text-sm font-bold">
        {reasonLabel}
        <textarea name="reason" maxLength={500} className={boxClasses} />
      </label>
      {state.fieldErrors?.reason && (
        <p role="alert" className="text-coral-deep text-sm">
          {state.fieldErrors.reason}
        </p>
      )}
      {tick && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="confirmed" className="accent-brand size-5" />
          {tick}
        </label>
      )}
      {state.fieldErrors?.confirmed && (
        <p role="alert" className="text-coral-deep text-sm">
          {state.fieldErrors.confirmed}
        </p>
      )}
      <div>
        <SubmitButton pendingLabel={pendingLabel}>{label}</SubmitButton>
      </div>
    </form>
  );
}

/** A button for an action with no input (unlock, resend...), showing what happened. */
export function ActionButton({
  action,
  label,
}: {
  action: () => Promise<FormState>;
  label: string;
}) {
  // useTransition: lets the button show "Working…" while the server action runs.
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await action());
          })
        }
        className="min-h-11 rounded-full border-2 border-zinc-300 px-4 text-sm font-bold disabled:opacity-50"
      >
        {pending && "Working…"}
        {!pending && label}
      </button>
      <FormError message={result.error} />
      <FormNotice message={result.notice} />
    </div>
  );
}

/** Set a date, or clear it (fee waiver). */
export function DateForm({
  action,
  label,
  current,
  suggested,
}: {
  action: FormAction;
  label: string;
  current: string | null;
  /** Filled in when nothing is set yet (e.g. the founding-seller waiver length). */
  suggested?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <label className="flex flex-col gap-1 text-sm font-bold">
        {label}
        <input
          type="date"
          name="until"
          defaultValue={current ?? suggested ?? ""}
          className="min-h-11 rounded-lg border-2 border-zinc-200 px-2"
        />
      </label>
      {state.fieldErrors?.until && (
        <p role="alert" className="text-coral-deep text-sm">
          {state.fieldErrors.until}
        </p>
      )}
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        {current && (
          <button
            type="submit"
            name="clear"
            value="1"
            className="min-h-11 px-3 font-bold underline"
          >
            Clear
          </button>
        )}
      </div>
    </form>
  );
}
