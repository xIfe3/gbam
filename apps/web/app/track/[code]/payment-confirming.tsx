"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Paystack tells us about a payment through a webhook, usually within seconds. We look
// again every few seconds for about a minute, then stop and let the customer refresh.
const CHECK_EVERY_MS = 3000;
const MAX_CHECKS = 20;

/**
 * Right after paying in the pop-up: "Confirming your payment…" while we wait for Paystack's
 * confirmation. router.refresh() re-renders the page with the latest status; once the order
 * is paid, the page stops showing this.
 */
export function PaymentConfirming() {
  const router = useRouter();
  const [checks, setChecks] = useState(0);

  useEffect(() => {
    if (checks >= MAX_CHECKS) {
      return;
    }
    const timer = setTimeout(() => {
      router.refresh();
      setChecks(checks + 1);
    }, CHECK_EVERY_MS);
    // Cleanup: stop the timer when the page changes or this box goes away.
    return () => clearTimeout(timer);
  }, [checks, router]);

  let message = "Confirming your payment with Paystack… This usually takes a few seconds.";
  if (checks >= MAX_CHECKS) {
    message =
      "Still waiting for Paystack to confirm. If money left your account, it will show here soon. Refresh the page in a minute.";
  }

  return (
    // role="status": screen readers read this out without interrupting.
    <section role="status" className="bg-brand-tint text-ink rounded-2xl p-5 font-medium">
      {message}
    </section>
  );
}
