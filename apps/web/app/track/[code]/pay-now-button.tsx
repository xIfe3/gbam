"use client";

import { formatNaira } from "@gbam/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/brand/form-bits";
import { openPaystackPopup } from "@/lib/paystack-popup";
import { payNowAction } from "../actions";

/**
 * Shown only while the order waits for payment. Opens Paystack's secure pop-up over our
 * page; if the pop-up can't open (old browser, blocked script), Paystack's own page instead.
 * After paying, the customer lands on their tracking page, which waits for the confirmation.
 */
export function PayNowButton({
  code,
  trackingKey,
  totalKobo,
}: {
  code: string;
  trackingKey: string;
  totalKobo: number;
}) {
  const router = useRouter();
  // useTransition: React tracks the request as "pending" so the button can show it's working.
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);

  function pay() {
    setError(undefined);
    startTransition(async () => {
      const result = await payNowAction(code, trackingKey);
      if (!result.url) {
        setError(result.error);
        return;
      }
      if (result.accessCode) {
        try {
          const outcome = await openPaystackPopup(result.accessCode);
          if (outcome === "paid") {
            // paid=1: the tracking page shows "Confirming your payment…" until the webhook lands.
            router.push(`/track/${code}?k=${encodeURIComponent(trackingKey)}&paid=1`);
          }
          // Closed without paying: stay here; they can press Pay again.
          return;
        } catch {
          // The pop-up couldn't open: fall through to Paystack's own page.
        }
      }
      window.location.assign(result.url);
    });
  }

  let label = `Pay ${formatNaira(totalKobo)} securely`;
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
      <p className="text-ink-muted text-xs">
        🔒 Your card details go straight to Paystack. Gbam and the seller never see them.
      </p>
      <FormError message={error} />
    </section>
  );
}
