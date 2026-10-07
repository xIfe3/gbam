"use client";

import { formatNaira } from "@gbam/shared";
import { useState, useTransition } from "react";
import { FormError } from "@/components/brand/form-bits";
import { payNowAction } from "../actions";

/** Shown only while the order waits for payment: opens the same Paystack link the seller sent. */
export function PayNowButton({
  code,
  trackingKey,
  totalKobo,
}: {
  code: string;
  trackingKey: string;
  totalKobo: number;
}) {
  // useTransition: React tracks the request as "pending" so the button can show it's working.
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);

  function pay() {
    startTransition(async () => {
      const result = await payNowAction(code, trackingKey);
      if (result.url) {
        // Paystack's secure page takes over; afterwards it returns the customer to the shop.
        window.location.assign(result.url);
        return;
      }
      setError(result.error);
    });
  }

  let label = `Pay ${formatNaira(totalKobo)} now`;
  if (pending) {
    label = "Opening Paystack…";
  }

  return (
    <section className="bg-brand-tint flex flex-col gap-3 rounded-2xl p-5">
      <p className="text-ink font-bold">This order is waiting for payment.</p>
      <button
        type="button"
        onClick={pay}
        disabled={pending}
        className="bg-brand hover:bg-brand-hover focus-visible:outline-brand min-h-12 rounded-full px-6 text-base font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
      >
        {label}
      </button>
      <p className="text-ink-muted text-xs">🔒 Payments are handled securely by Paystack.</p>
      <FormError message={error} />
    </section>
  );
}
