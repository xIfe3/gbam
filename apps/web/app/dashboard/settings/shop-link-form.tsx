"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/(auth)/action-helpers";
import { SlugField } from "@/app/(auth)/signup/slug-check";
import { FormError, FormNotice, SubmitButton } from "@/components/brand/form-bits";
import { changeSlugAction, checkShopSlugAction } from "./actions";

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", {
    dateStyle: "medium",
    timeZone: "Africa/Lagos",
  });
}

/**
 * Change the shop link. The old link keeps working (it redirects to the new one), and the
 * link can change at most once every 30 days, so shared links don't keep moving.
 */
export function ShopLinkForm({
  slug,
  nextChangeAt,
}: {
  slug: string;
  nextChangeAt: string | null;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(changeSlugAction, {});
  const [value, setValue] = useState(slug);
  const waiting = nextChangeAt !== null;

  return (
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      className="flex flex-col gap-4"
      noValidate
    >
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <SlugField
        value={value}
        onChange={setValue}
        check={checkShopSlugAction}
        error={state.fieldErrors?.slug}
      />
      <p className="text-ink-muted text-sm">
        Your old link keeps working: anyone who opens it is taken to the new one. You can change
        your link once every 30 days.
      </p>
      {waiting && (
        <p className="text-coral-deep text-sm font-bold">
          You changed your link recently. Your next change is possible from{" "}
          {formatDay(nextChangeAt)}.
        </p>
      )}
      <div>
        <SubmitButton pendingLabel="Saving…" disabled={waiting}>
          Change link
        </SubmitButton>
      </div>
    </form>
  );
}
