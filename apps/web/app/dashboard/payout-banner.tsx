import { Landmark } from "lucide-react";
import Link from "next/link";

/** Shown on every dashboard page until the seller has added their bank account. */
export function PayoutBanner() {
  return (
    <aside
      aria-label="Payouts"
      className="bg-coral-wash border-coral-tint mb-6 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-ink flex items-start gap-2 text-sm font-medium">
        <Landmark size={18} className="text-coral-deep mt-0.5 shrink-0" aria-hidden="true" />
        <span>Your shop can&apos;t take orders until you add your bank account</span>
      </p>
      <Link
        href="/signup/get-paid"
        className="bg-brand hover:bg-brand-hover focus-visible:outline-brand inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Add bank account
      </Link>
    </aside>
  );
}
