import type { Metadata } from "next";
import { BentoGrid, BentoTile } from "@/components/brand/bento";
import { CtaBand } from "@/components/brand/cta-band";
import { PageHeader } from "@/components/brand/page-header";

export const metadata: Metadata = {
  title: "About",
  description: "Why Gbam exists, and who is building it.",
};

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="Why Gbam exists"
        lead="Many Nigerian businesses sell on WhatsApp. Payments, orders and updates end up scattered across chats. Gbam puts them in one place."
        photo={{ description: "small business owner at work with her phone" }}
      />
      <div className="mx-auto max-w-5xl px-4">
        <BentoGrid>
          <BentoTile
            eyebrow="The idea"
            title="Keep selling where your customers are"
            tint="brand"
            span={2}
          >
            WhatsApp is where your customers already talk to you. Gbam keeps that, and adds a shop
            link, Paystack payments and automatic updates so you stop copying account numbers and
            checking transfers by hand.
          </BentoTile>
          <BentoTile eyebrow="Zephra Studios" title="Built by Zephra Studios">
            Gbam is made by Zephra Studios (registration pending), a small software studio.
          </BentoTile>
          <BentoTile eyebrow="The team" title="A small team" tint="coral">
            We are a small team and we are still early. If something does not work for your shop,
            tell us at hello@gbam.app and we will listen.
          </BentoTile>
        </BentoGrid>
      </div>
      <CtaBand />
    </>
  );
}
