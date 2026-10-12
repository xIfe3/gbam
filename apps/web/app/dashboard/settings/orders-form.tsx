"use client";

import { useActionState } from "react";
import { FormError, FormNotice, SubmitButton } from "@/components/brand/form-bits";
import type { FormState } from "@/app/(auth)/action-helpers";
import { updateOrderSettingsAction } from "./actions";

/**
 * "Check each order before the customer pays". Off (the default) = customers pay the moment
 * they order. On = for made-to-order shops: each order waits for "Request payment".
 */
export function OrdersForm({ approveOrdersFirst }: { approveOrdersFirst: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(updateOrderSettingsAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700">
        <input
          type="checkbox"
          name="approveOrdersFirst"
          defaultChecked={approveOrdersFirst}
          className="accent-brand size-5"
        />
        Check each order before the customer pays
      </label>
      <div>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}
