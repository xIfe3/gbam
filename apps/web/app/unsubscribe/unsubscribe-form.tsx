"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(auth)/action-helpers";
import { FormError, FormNotice, SubmitButton } from "@/components/brand/form-bits";
import { unsubscribeAction } from "./actions";

/** One button: unsubscribing only happens when it's pressed, never by just opening the link. */
export function UnsubscribeForm({ sellerId, token }: { sellerId: string; token: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    unsubscribeAction.bind(null, sellerId, token),
    {},
  );
  if (state.notice) {
    return <FormNotice message={state.notice} />;
  }
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormError message={state.error} />
      <SubmitButton pendingLabel="Unsubscribing…">Unsubscribe</SubmitButton>
    </form>
  );
}
