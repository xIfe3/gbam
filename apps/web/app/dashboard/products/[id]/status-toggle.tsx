"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/brand/form-bits";
import { setProductStatusAction } from "../actions";

/** "Hide from shop" / "Show in shop" on the product details page. */
export function StatusToggle({ id, status }: { id: string; status: "active" | "hidden" }) {
  const router = useRouter();
  // useTransition: React tracks the save as "pending" so we can disable the button meanwhile.
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);

  let label = "Hide from shop";
  let next: "active" | "hidden" = "hidden";
  if (status === "hidden") {
    label = "Show in shop";
    next = "active";
  }

  function toggle() {
    startTransition(async () => {
      const result = await setProductStatusAction(id, next);
      setError(result.error);
      if (!result.error) {
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="border-brand-tint text-ink hover:bg-brand-tint focus-visible:outline-brand inline-flex min-h-11 items-center rounded-full border-2 bg-white px-5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
      >
        {label}
      </button>
      <FormError message={error} />
    </>
  );
}
