"use client";

import {
  TICKET_PRIORITIES,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from "@gbam/shared";
import { useActionState, useId } from "react";
import type { FormState } from "@/app/(auth)/action-helpers";
import { FormError, FormNotice } from "@/components/brand/form-bits";

type FormAction = (previous: FormState, formData: FormData) => Promise<FormState>;

const boxClasses = "min-h-24 w-full rounded-lg border-2 border-zinc-200 p-2 text-base";
const selectClasses = "min-h-11 rounded-lg border-2 border-zinc-200 bg-white px-2";
const buttonClasses =
  "bg-brand min-h-11 rounded-full px-5 font-bold text-white disabled:opacity-50";

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  urgent: "Urgent",
};

/** A message box with a send button: the reply form and the internal note form. */
export function MessageForm({
  action,
  label,
  button,
  hint,
}: {
  action: FormAction;
  label: string;
  button: string;
  hint?: string;
}) {
  // useActionState keeps the form's last result (error or "sent") between submits.
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const boxId = useId();
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <label htmlFor={boxId} className="text-sm font-bold">
        {label}
      </label>
      {hint && <p className="text-ink-muted text-sm">{hint}</p>}
      <textarea id={boxId} name="message" maxLength={5000} className={boxClasses} />
      {state.fieldErrors?.message && (
        <p className="text-coral-deep text-sm">{state.fieldErrors.message}</p>
      )}
      <div>
        <button type="submit" disabled={pending} className={buttonClasses}>
          {pending && "Sending…"}
          {!pending && button}
        </button>
      </div>
    </form>
  );
}

/** Status, priority and who it's assigned to, saved with one button. */
export function TicketSettingsForm({
  action,
  status,
  priority,
  assigneeId,
  assignees,
}: {
  action: FormAction;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId: string | null;
  assignees: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  let currentAssignee = "";
  if (assigneeId !== null) {
    currentAssignee = assigneeId;
  }
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <label className="flex flex-col text-sm font-bold">
        Status
        <select name="status" defaultValue={status} className={selectClasses}>
          {TICKET_STATUSES.map((value) => (
            <option key={value} value={value}>
              {TICKET_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-sm font-bold">
        Priority
        <select name="priority" defaultValue={priority} className={selectClasses}>
          {TICKET_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {PRIORITY_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-sm font-bold">
        Assigned to
        <select name="assigneeId" defaultValue={currentAssignee} className={selectClasses}>
          <option value="">Nobody</option>
          {assignees.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={buttonClasses}>
        {pending && "Saving…"}
        {!pending && "Save"}
      </button>
    </form>
  );
}
