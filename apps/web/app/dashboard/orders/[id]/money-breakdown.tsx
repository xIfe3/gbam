import { estimatePaystackFee, formatNaira, PLATFORM_FEE } from "@gbam/shared";
import type { OrderDetail } from "@/lib/api";

/**
 * Shows the seller where the money goes: customer pays → Paystack fee → gbam fee →
 * what the seller receives. Uses the real Paystack fee once paid, an estimate before.
 */
export function MoneyBreakdown({ payments }: { payments: OrderDetail["payments"] }) {
  // Prefer the successful payment; otherwise the newest unpaid link.
  let payment = payments.find((p) => p.status === "success");
  let isPaid = true;
  if (!payment) {
    payment = payments.find((p) => p.status === "pending");
    isPaid = false;
  }
  if (!payment) {
    return null; // no payment requested yet: nothing to show
  }

  let paystackFee = estimatePaystackFee(payment.amountKobo);
  let paystackFeeIsEstimate = true;
  if (payment.paystackFeeKobo !== null) {
    paystackFee = payment.paystackFeeKobo;
    paystackFeeIsEstimate = false;
  }

  const sellerReceives = payment.amountKobo - paystackFee - payment.platformFeeKobo;

  let title = "Expected when paid";
  if (isPaid) {
    title = "Payment";
  }

  let paystackLabel = "Paystack fee";
  if (paystackFeeIsEstimate) {
    paystackLabel = "Paystack fee (estimate)";
  }

  // e.g. 150 basis points → "1.5%"
  let gbamLabel = `gbam fee (${PLATFORM_FEE.percentBasisPoints / 100}%)`;
  if (payment.platformFeeKobo === 0) {
    gbamLabel = "gbam fee (founding seller: free)";
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="mb-2 font-semibold">{title}</h2>
      <dl className="space-y-1 text-sm">
        <Row label="Customer pays" value={formatNaira(payment.amountKobo)} />
        <Row label={paystackLabel} value={`− ${formatNaira(paystackFee)}`} />
        <Row label={gbamLabel} value={`− ${formatNaira(payment.platformFeeKobo)}`} />
        <div className="flex justify-between border-t border-zinc-200 pt-2 font-semibold">
          <dt>You receive</dt>
          <dd className="tabular-nums">{formatNaira(sellerReceives)}</dd>
        </div>
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-zinc-600">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
