"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Paystack tells us about a payment through a webhook. For a card that's usually seconds,
// so we look again every few seconds for a minute. A bank transfer can take a few minutes,
// so after that we keep looking, less often, for up to 10 minutes, then let them refresh.
const FAST_CHECK_MS = 3000;
const FAST_CHECKS = 20;
const SLOW_CHECK_MS = 15_000;
const SLOW_CHECKS = 36;

/**
 * Right after paying in the pop-up: "Confirming your payment…" while we wait for Paystack's
 * confirmation. router.refresh() re-renders the page with the latest status; once the order
 * is paid, the page stops showing this.
 */
export function PaymentConfirming() {
  const router = useRouter();
  const [checks, setChecks] = useState(0);

  useEffect(() => {
    if (checks >= FAST_CHECKS + SLOW_CHECKS) {
      return;
    }
    let wait = FAST_CHECK_MS;
    if (checks >= FAST_CHECKS) {
      wait = SLOW_CHECK_MS;
    }
    const timer = setTimeout(() => {
      router.refresh();
      setChecks(checks + 1);
    }, wait);
    // Cleanup: stop the timer when the page changes or this box goes away.
    return () => clearTimeout(timer);
  }, [checks, router]);

  let message = "Confirming your payment with Paystack… This usually takes a few seconds.";
  if (checks >= FAST_CHECKS) {
    message =
      "Still waiting for Paystack to confirm. Bank transfers can take a few minutes; this page keeps checking.";
  }
  if (checks >= FAST_CHECKS + SLOW_CHECKS) {
    message =
      "Still waiting for Paystack to confirm. If money left your account, it will show here soon. Refresh the page in a few minutes.";
  }

  return (
    // role="status": screen readers read this out without interrupting.
    <section role="status" className="bg-brand-tint text-ink rounded-2xl p-5 font-medium">
      {message}
    </section>
  );
}
