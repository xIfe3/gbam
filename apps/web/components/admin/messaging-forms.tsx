"use client";

import { NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPES, type Audience } from "@gbam/shared";
import { useActionState, useId } from "react";
import type { FormState } from "@/app/(auth)/action-helpers";
import { FormError, FormNotice } from "@/components/brand/form-bits";
import type { CountState, PreviewState } from "@/app/admin/(signed-in)/messaging-actions";

type Action<S> = (previous: S, formData: FormData) => Promise<S>;

const inputClasses = "min-h-11 w-full rounded-lg border-2 border-zinc-200 bg-white px-2 text-base";
const boxClasses = "min-h-32 w-full rounded-lg border-2 border-zinc-200 p-2 text-base";
const buttonClasses =
  "bg-brand min-h-11 rounded-full px-5 font-bold text-white disabled:opacity-50";
const secondaryClasses =
  "min-h-11 rounded-full border-2 border-zinc-300 px-5 font-bold disabled:opacity-50";

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return <p className="text-coral-deep text-sm">{message}</p>;
}

/** "yes" / "no" / "" for the any-yes-no selects. */
function yesNoValue(value: boolean | undefined): string {
  if (value === true) {
    return "yes";
  }
  if (value === false) {
    return "no";
  }
  return "";
}

function YesNoSelect({ name, label, value }: { name: string; label: string; value?: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-bold">
      {label}
      <select name={name} defaultValue={yesNoValue(value)} className={inputClasses}>
        <option value="">Any</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

/**
 * Who a message goes to. Everything left empty means every seller. Suspended and closed shops
 * are always left out, and for emails, sellers who unsubscribed too.
 */
export function AudienceFields({ audience }: { audience?: Audience }) {
  const current = audience ?? {};
  let noOrderDays = "";
  if (current.noOrderDays !== undefined) {
    noOrderDays = String(current.noOrderDays);
  }
  return (
    <fieldset className="grid gap-3 rounded-xl border border-zinc-200 p-4 sm:grid-cols-3">
      <legend className="px-1 text-sm font-bold">Who it goes to (empty = every seller)</legend>
      <YesNoSelect name="verified" label="Email verified" value={current.verified} />
      <YesNoSelect name="hasProducts" label="Has products" value={current.hasProducts} />
      <YesNoSelect name="hasBank" label="Has a bank account" value={current.hasBank} />
      <label className="flex flex-col gap-1 text-sm font-bold">
        No paid order in (days)
        <input
          type="number"
          name="noOrderDays"
          min={1}
          max={365}
          defaultValue={noOrderDays}
          className={inputClasses}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold">
        Signed up from
        <input
          type="date"
          name="signedUpFrom"
          defaultValue={current.signedUpFrom}
          className={inputClasses}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold">
        Signed up until
        <input
          type="date"
          name="signedUpTo"
          defaultValue={current.signedUpTo}
          className={inputClasses}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold sm:col-span-3">
        One shop only (its id, from the shop&apos;s admin page)
        <input name="shopId" defaultValue={current.shopId} className={inputClasses} />
      </label>
    </fieldset>
  );
}

export type AnnouncementValues = {
  subject: string;
  body: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
  audience: Audience;
};

/** Write or edit an announcement, with a preview of the email before it's saved. */
export function AnnouncementForm({
  action,
  previewAction,
  initial,
  saveLabel,
}: {
  action: Action<PreviewState>;
  previewAction: Action<PreviewState>;
  initial?: AnnouncementValues;
  saveLabel: string;
}) {
  const [state, formAction, saving] = useActionState<PreviewState, FormData>(action, {});
  const [preview, previewFormAction, previewing] = useActionState<PreviewState, FormData>(
    previewAction,
    {},
  );
  const subjectId = useId();
  const bodyId = useId();
  const labelId = useId();
  const urlId = useId();

  let fieldErrors: Record<string, string> = {};
  if (state.fieldErrors) {
    fieldErrors = state.fieldErrors;
  } else if (preview.fieldErrors) {
    fieldErrors = preview.fieldErrors;
  }

  return (
    // onReset preventDefault: React clears a form after its action runs; keep what was typed.
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      className="flex flex-col gap-4"
      noValidate
    >
      <FormError message={state.error ?? preview.error} />
      <FormNotice message={state.notice} />
      <div className="flex flex-col gap-1">
        <label htmlFor={subjectId} className="text-sm font-bold">
          Subject
        </label>
        <input
          id={subjectId}
          name="subject"
          maxLength={150}
          defaultValue={initial?.subject}
          className={inputClasses}
        />
        <FieldError message={fieldErrors.subject} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={bodyId} className="text-sm font-bold">
          Message
        </label>
        <p className="text-ink-muted text-sm">
          A blank line starts a new paragraph. **Bold**, [link text](https://…), and lines starting
          with &quot;- &quot; make a list.
        </p>
        <textarea
          id={bodyId}
          name="body"
          maxLength={10_000}
          defaultValue={initial?.body}
          className={boxClasses}
        />
        <FieldError message={fieldErrors.body} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={labelId} className="text-sm font-bold">
            Button text (optional)
          </label>
          <input
            id={labelId}
            name="buttonLabel"
            maxLength={40}
            defaultValue={initial?.buttonLabel ?? ""}
            className={inputClasses}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={urlId} className="text-sm font-bold">
            Button link (optional)
          </label>
          <input
            id={urlId}
            name="buttonUrl"
            placeholder="https://gbam.app/…"
            defaultValue={initial?.buttonUrl ?? ""}
            className={inputClasses}
          />
          <FieldError message={fieldErrors.buttonUrl} />
        </div>
      </div>
      <AudienceFields audience={initial?.audience} />
      <FieldError message={fieldErrors.audience} />
      <div className="flex flex-wrap gap-2">
        {/* formAction on a button: this one runs the preview instead of saving. */}
        <button
          type="submit"
          formAction={previewFormAction}
          disabled={previewing}
          className={secondaryClasses}
        >
          {previewing && "Loading…"}
          {!previewing && "Preview"}
        </button>
        <button type="submit" disabled={saving} className={buttonClasses}>
          {saving && "Saving…"}
          {!saving && saveLabel}
        </button>
      </div>
      {preview.preview && (
        <section className="space-y-2">
          <p className="text-sm">
            <strong>{preview.preview.subject}</strong> · goes to {preview.preview.recipients}{" "}
            sellers now
          </p>
          {/* sandbox="": the preview can't run scripts or reach this page. */}
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={preview.preview.html}
            className="h-[32rem] w-full rounded-xl border border-zinc-200 bg-white"
          />
        </section>
      )}
    </form>
  );
}

/** Send now or at a time, after typing how many sellers it goes to. */
export function SendAnnouncementForm({
  action,
  audienceCount,
}: {
  action: Action<FormState>;
  audienceCount: number;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const countId = useId();
  const whenId = useId();
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <p className="text-sm">
        It goes to {audienceCount} sellers right now (worked out again when it&apos;s sent).
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={whenId} className="text-sm font-bold">
          Send at (Lagos time, leave empty to send now)
        </label>
        <input id={whenId} type="datetime-local" name="scheduledAt" className={inputClasses} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={countId} className="text-sm font-bold">
          Type {audienceCount} to confirm
        </label>
        <input id={countId} type="number" name="confirmCount" min={0} className={inputClasses} />
        <FieldError message={state.fieldErrors?.confirmCount} />
      </div>
      <div>
        <button type="submit" disabled={pending} className={buttonClasses}>
          {pending && "Working…"}
          {!pending && "Send or schedule"}
        </button>
      </div>
    </form>
  );
}

/** A notification for sellers' dashboard bells. */
export function NotificationForm({
  action,
  countAction,
}: {
  action: Action<FormState>;
  countAction: Action<CountState>;
}) {
  const [state, formAction, sending] = useActionState<FormState, FormData>(action, {});
  const [count, countFormAction, counting] = useActionState<CountState, FormData>(countAction, {});
  const titleId = useId();
  const bodyId = useId();
  const linkId = useId();
  const endsId = useId();
  const confirmId = useId();
  let fieldErrors: Record<string, string> = {};
  if (state.fieldErrors) {
    fieldErrors = state.fieldErrors;
  }

  return (
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      className="flex flex-col gap-4"
      noValidate
    >
      <FormError message={state.error ?? count.error} />
      <FormNotice message={state.notice} />
      <label className="flex flex-col gap-1 text-sm font-bold">
        Type
        <select name="type" defaultValue="info" className={inputClasses}>
          {NOTIFICATION_TYPES.map((type) => (
            <option key={type} value={type}>
              {NOTIFICATION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-1">
        <label htmlFor={titleId} className="text-sm font-bold">
          Title
        </label>
        <input id={titleId} name="title" maxLength={80} className={inputClasses} />
        <FieldError message={fieldErrors.title} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={bodyId} className="text-sm font-bold">
          Text
        </label>
        <textarea id={bodyId} name="body" maxLength={300} className={boxClasses} />
        <FieldError message={fieldErrors.body} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={linkId} className="text-sm font-bold">
            Opens (optional)
          </label>
          <input
            id={linkId}
            name="link"
            placeholder="/dashboard/settings"
            className={inputClasses}
          />
          <FieldError message={fieldErrors.link} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={endsId} className="text-sm font-bold">
            Stop showing it at (Lagos time, optional)
          </label>
          <input id={endsId} type="datetime-local" name="endsAt" className={inputClasses} />
        </div>
      </div>
      <AudienceFields />
      <FieldError message={fieldErrors.audience} />
      <div className="flex flex-wrap items-end gap-3">
        <button
          type="submit"
          formAction={countFormAction}
          disabled={counting}
          className={secondaryClasses}
        >
          {counting && "Counting…"}
          {!counting && "Check how many"}
        </button>
        {count.recipients !== undefined && (
          <p className="text-sm font-bold">Goes to {count.recipients} sellers now</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={confirmId} className="text-sm font-bold">
          Type the number of sellers to confirm
        </label>
        <input id={confirmId} type="number" name="confirmCount" min={0} className={inputClasses} />
        <FieldError message={fieldErrors.confirmCount} />
      </div>
      <div>
        <button type="submit" disabled={sending} className={buttonClasses}>
          {sending && "Sending…"}
          {!sending && "Send notification"}
        </button>
      </div>
    </form>
  );
}
