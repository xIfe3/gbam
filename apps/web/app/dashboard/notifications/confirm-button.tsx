"use client";

import { useState } from "react";
import { PendingButton } from "@/components/brand/form-bits";

/**
 * For things that can't be undone (delete for good, empty the trash): the first tap only
 * asks "Are you sure?", the second one does it.
 */
export function ConfirmButton({
  action,
  label,
  confirmLabel,
  question,
}: {
  action: () => Promise<void>;
  label: string;
  confirmLabel: string;
  question: string;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="text-coral-deep rounded-full border-2 border-current px-4 py-2 text-sm font-bold"
      >
        {label}
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <span className="text-ink text-sm font-bold">{question}</span>
      <PendingButton
        pendingLabel="Deleting…"
        className="bg-coral-deep rounded-full px-4 py-2 text-sm font-bold text-white"
      >
        {confirmLabel}
      </PendingButton>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="text-ink px-2 py-2 text-sm font-bold underline"
      >
        Keep
      </button>
    </form>
  );
}
