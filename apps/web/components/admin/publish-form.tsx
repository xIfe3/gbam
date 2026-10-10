"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/app/(auth)/action-helpers";
import { FormError, FormNotice } from "@/components/brand/form-bits";

/** "Publish" now, or at a time (Lagos time) if one is picked. */
export function PublishForm({
  action,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const atId = useId();
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <div className="flex flex-col gap-1">
        <label htmlFor={atId} className="text-sm font-bold">
          Publish at (Lagos time, leave empty for now)
        </label>
        <input
          id={atId}
          type="datetime-local"
          name="at"
          className="min-h-11 rounded-lg border-2 border-zinc-200 bg-white px-2"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="bg-brand min-h-11 rounded-full px-5 font-bold text-white disabled:opacity-50"
      >
        {pending && "Publishing…"}
        {!pending && "Publish"}
      </button>
    </form>
  );
}
