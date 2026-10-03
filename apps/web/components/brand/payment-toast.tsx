import { formatNaira } from "@gbam/shared";

// The floating "Payment received" card from the home hero. Shows example data passed by the
// caller (it is an illustration, not a real payment).
export function PaymentToast({ amountKobo, code }: { amountKobo: number; code: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5 text-xs whitespace-nowrap shadow-xl shadow-ink/20">
      <span
        aria-hidden="true"
        className="font-display bg-coral-tint text-coral-deep flex h-8 w-8 items-center justify-center rounded-full text-lg font-black"
      >
        !
      </span>
      <span>
        <b className="text-ink block text-sm">Payment received</b>
        <small className="text-ink-subtle">
          {formatNaira(amountKobo)} · {code} · just now
        </small>
      </span>
    </div>
  );
}
