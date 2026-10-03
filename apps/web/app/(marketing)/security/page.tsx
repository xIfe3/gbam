import type { Metadata } from "next";
import { BentoGrid, BentoTile } from "@/components/brand/bento";
import { CtaBand } from "@/components/brand/cta-band";
import { PageHeader } from "@/components/brand/page-header";

export const metadata: Metadata = {
  title: "Security",
  description: "How Gbam protects money and data: Paystack payments, signed webhooks, HTTPS.",
};

export default function SecurityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Security"
        title="How we protect money and data"
        lead="Here is what we do, in plain words. If you have a security concern, write to support@gbam.app."
        photo={{ description: "seller using her phone safely at home" }}
      />
      <div className="mx-auto max-w-5xl px-4">
        <BentoGrid>
          <BentoTile eyebrow="Payments" title="Paystack handles cards" tint="brand" span={2}>
            Customers pay on Paystack&apos;s secure payment page. Card numbers go to Paystack, so
            Gbam never sees or stores them.
          </BentoTile>
          <BentoTile eyebrow="Webhooks" title="Signed webhooks, verified">
            When Paystack tells us a payment happened, we check its signature before we trust the
            message. An order is only marked paid after that check passes.
          </BentoTile>
          <BentoTile eyebrow="Passwords" title="Passwords are hashed" tint="coral">
            We store a one-way hash of your password, never the password itself.
          </BentoTile>
          <BentoTile eyebrow="Connections" title="HTTPS everywhere" span={2}>
            Traffic between your browser and Gbam is encrypted with HTTPS.
          </BentoTile>
        </BentoGrid>
      </div>
      <CtaBand />
    </>
  );
}
