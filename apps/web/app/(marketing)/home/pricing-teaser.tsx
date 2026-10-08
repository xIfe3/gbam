import { Button } from "@/components/brand/button";
import type { LiveFees } from "@/lib/fees";

export function PricingTeaser({ fees }: { fees: LiveFees }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <div className="bg-coral-wash rounded-3xl px-6 py-12 text-center">
        <p className="text-brand-hover text-xs font-bold tracking-widest uppercase">Pricing</p>
        <h2 className="font-display text-ink mt-2 text-3xl font-black sm:text-4xl">
          {fees.percent}% per paid order, never more than {fees.cap}
        </h2>
        <p className="text-ink-muted mx-auto mt-3 max-w-md">
          You only pay when an order is paid. Free for founding sellers.
        </p>
        <div className="mt-6 flex justify-center">
          <Button href="/pricing" variant="secondary" size="lg">
            See pricing
          </Button>
        </div>
      </div>
    </section>
  );
}
