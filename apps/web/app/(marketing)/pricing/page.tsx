import type { Metadata } from "next";
import { BentoGrid, BentoTile } from "@/components/brand/bento";
import { CtaBand } from "@/components/brand/cta-band";
import { PageHeader } from "@/components/brand/page-header";
import { platformFeeCap, platformFeePercent } from "@/lib/fees";
import { FeeCalculator } from "./fee-calculator";

export const metadata: Metadata = {
  title: "Pricing",
  description: `${platformFeePercent}% per paid order, never more than ${platformFeeCap}. Free for founding sellers.`,
};

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title={`${platformFeePercent}% per paid order, capped at ${platformFeeCap}`}
        lead="No monthly fee and no setup fee. You only pay when an order is paid."
        photo={{ description: "seller smiling at a paid order notification" }}
        cta={{ href: "/signup", label: "Start selling free" }}
      />
      <div className="mx-auto max-w-5xl px-4">
        <BentoGrid>
          <BentoTile
            eyebrow="Our fee"
            title={`${platformFeePercent}%, never more than ${platformFeeCap}`}
            tint="brand"
          >
            Gbam takes {platformFeePercent}% of each paid order. A very large order never costs you
            more than {platformFeeCap} in Gbam fees.
          </BentoTile>
          <BentoTile eyebrow="Paystack" title="Paystack's fee is separate">
            Paystack charges its own processing fee on each payment. It comes out of your share of
            the order, and the calculator below shows an estimate.
          </BentoTile>
          <BentoTile
            eyebrow="Founding sellers"
            title="Free for founding sellers"
            tint="coral"
            span={2}
          >
            Early sellers pay no Gbam fee for a launch period. Paystack&apos;s fee still applies.
          </BentoTile>
        </BentoGrid>

        <section className="py-12">
          <h2 className="font-display text-ink mb-2 text-3xl font-black">What you would receive</h2>
          <p className="text-ink-muted mb-6 max-w-lg">
            Type an order amount. This shows the standard fee, without the founding-seller offer.
            The Paystack figure is an estimate.
          </p>
          <div className="max-w-md">
            <FeeCalculator />
          </div>
        </section>
      </div>
      <CtaBand />
    </>
  );
}
