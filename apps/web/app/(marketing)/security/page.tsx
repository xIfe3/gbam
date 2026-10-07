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
        photo={{
          description: "seller using her phone safely at home",
          src: "/images/pages/security.webp",
          alt: "A woman using her phone",
        }}
      />
      <div className="mx-auto max-w-5xl px-4">
        <BentoGrid>
          <BentoTile eyebrow="Payments" title="Paystack handles cards" tint="brand" span={2}>
            Customers pay in Paystack&apos;s secure payment window. Card numbers go straight to
            Paystack, so Gbam never sees or stores them.
          </BentoTile>
          <BentoTile eyebrow="Webhooks" title="Signed webhooks, verified">
            When Paystack tells us a payment happened, we check its signature before we trust the
            message. An order is only marked paid after that check passes.
          </BentoTile>
          <BentoTile eyebrow="Passwords" title="Passwords are hashed" tint="coral">
            We store a one-way hash of your password, never the password itself.
          </BentoTile>
          <BentoTile eyebrow="Your payouts" title="Bank changes need your password">
            Changing the bank account your money goes to needs your password, not just a signed-in
            phone, and we email you every time it changes.
          </BentoTile>
          <BentoTile eyebrow="Your account" title="Sign out other devices" tint="brand">
            Changing your password signs out every other phone and computer, in case the old one
            leaked.
          </BentoTile>
          <BentoTile eyebrow="Orders" title="Private order links">
            A customer&apos;s order page opens only with its private link, or with the order code
            plus the last 4 digits of their phone number. Wrong guesses are limited.
          </BentoTile>
          <BentoTile eyebrow="Connections" title="HTTPS everywhere">
            Traffic between your browser and Gbam is encrypted with HTTPS.
          </BentoTile>
        </BentoGrid>
      </div>
      <CtaBand />
    </>
  );
}
