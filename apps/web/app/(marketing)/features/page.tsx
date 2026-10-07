import type { Metadata } from "next";
import { BentoGrid, BentoTile } from "@/components/brand/bento";
import { CtaBand } from "@/components/brand/cta-band";
import { PageHeader } from "@/components/brand/page-header";

export const metadata: Metadata = {
  title: "Features",
  description:
    "One shop link, Paystack payments, automatic WhatsApp updates and an order dashboard for Nigerian sellers.",
};

export default function FeaturesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Features"
        title="Everything a WhatsApp shop needs"
        lead="Stop chasing payments in the DMs. Gbam gives you a shop link, takes payment, tells your customers what is happening, and keeps your orders in one place."
        photo={{
          description: "seller checking orders on her phone at her stall",
          src: "/images/pages/features.webp",
          alt: "A food seller checking an order on his phone at his stall",
        }}
        cta={{ href: "/signup", label: "Start selling free" }}
      />
      <div className="mx-auto max-w-5xl px-4">
        <BentoGrid>
          <BentoTile
            eyebrow="Storefront"
            title="One link for your whole shop"
            tint="brand"
            span={2}
          >
            Put your products on a page of your own and share the link on your WhatsApp status, in
            your bio or in any chat. Customers open it in their browser: no app to install.
          </BentoTile>
          <BentoTile eyebrow="Payments" title="Review & pay with Paystack">
            Each order comes with a payment link. Customers see what they ordered and the total,
            then pay in Paystack&apos;s secure window, so we never see their card numbers.
          </BentoTile>
          <BentoTile eyebrow="Updates" title="Automatic WhatsApp updates" tint="coral">
            Order received, payment confirmed, on its way: your customer gets a WhatsApp message at
            each step without you typing it.
          </BentoTile>
          <BentoTile eyebrow="Orders" title="An order dashboard">
            See every order with its status (new, awaiting payment, paid, sent out, delivered) and a
            history of what changed and when.
          </BentoTile>
          <BentoTile eyebrow="Payouts" title="Paid out to your bank">
            Money from paid orders is settled to the bank account you add during setup, through a
            Paystack subaccount in your name.
          </BentoTile>
          <BentoTile eyebrow="Delivery" title="Delivery status" span={2}>
            Mark an order as sent out or delivered and your customer is told for you. You still
            arrange the delivery yourself, with your own rider or courier.
          </BentoTile>
          <BentoTile eyebrow="Products" title="Photos, options and stock" tint="coral">
            Add products with photos, a price and options such as size or colour. Each
            combination can have its own price and stock, and stock comes off when an order is
            paid.
          </BentoTile>
          <BentoTile eyebrow="Tracking" title="Order tracking for customers">
            Customers get an order code and a private link to follow their order, pay, or report
            a problem. No account needed.
          </BentoTile>
          <BentoTile eyebrow="Refunds" title="Cancel and refund safely">
            Cancelling gives you a few seconds to undo. Refunds show the payment reference and the
            steps to give the money back.
          </BentoTile>
          <BentoTile eyebrow="Settings" title="Your shop, your way" tint="brand">
            Change your shop name, WhatsApp number, payout bank account or password whenever you
            need to.
          </BentoTile>
        </BentoGrid>
      </div>
      <CtaBand />
    </>
  );
}
