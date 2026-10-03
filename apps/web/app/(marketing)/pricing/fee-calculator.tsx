"use client";

import { calculatePlatformFee, estimatePaystackFee, formatNaira } from "@gbam/shared";
import { useState } from "react";

// "What would I receive?" calculator. The amount is typed in naira; fees are worked out
// in kobo (₦1 = 100 kobo) with the same functions the real checkout uses.
export function FeeCalculator() {
  const [naira, setNaira] = useState("10000");

  const amountKobo = Math.round(Number(naira) * 100);
  const valid = Number.isFinite(amountKobo) && amountKobo > 0;

  let result = null;
  if (valid) {
    // null = no founding-seller waiver, so this shows the standard fee.
    const gbamFee = calculatePlatformFee(amountKobo, null);
    const paystackFee = estimatePaystackFee(amountKobo);
    result = { gbamFee, paystackFee, receive: amountKobo - gbamFee - paystackFee };
  }

  return (
    <div className="rounded-3xl bg-white p-6">
      <label htmlFor="order-amount" className="text-ink block text-sm font-bold">
        Order amount (₦)
      </label>
      <input
        id="order-amount"
        type="number"
        inputMode="numeric"
        min="0"
        value={naira}
        onChange={(event) => setNaira(event.target.value)}
        className="border-ink-subtle text-ink focus-visible:outline-brand mt-2 min-h-11 w-full rounded-xl border-2 px-4 text-lg focus-visible:outline-2 focus-visible:outline-offset-2"
      />

      <div aria-live="polite" className="mt-6">
        {result && (
          <>
            <dl className="text-ink space-y-3 text-base">
              <div className="flex justify-between gap-4">
                <dt>Gbam fee</dt>
                <dd data-testid="gbam-fee" className="font-bold">
                  {formatNaira(result.gbamFee)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Paystack fee (estimate)</dt>
                <dd data-testid="paystack-fee" className="font-bold">
                  {formatNaira(result.paystackFee)}
                </dd>
              </div>
            </dl>
            <p className="font-display text-ink border-ink/10 mt-3 border-t pt-3 text-2xl font-black">
              You receive {formatNaira(result.receive)}
            </p>
          </>
        )}
        {!result && (
          <p className="text-ink-muted">Enter an amount to see what you would receive.</p>
        )}
      </div>
    </div>
  );
}
