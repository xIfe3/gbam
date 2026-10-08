import type { Metadata } from "next";
import { connection } from "next/server";
import { CtaBand } from "@/components/brand/cta-band";
import { liveFees } from "@/lib/fees";
import { FaqHighlights } from "./home/faq-highlights";
import { Features } from "./home/features";
import { Hero } from "./home/hero";
import { HowItWorks } from "./home/how-it-works";
import { PricingTeaser } from "./home/pricing-teaser";
import { SellersCollage } from "./home/sellers-collage";

export const metadata: Metadata = {
  title: { absolute: "Gbam: take orders and get paid on WhatsApp" },
  description:
    "Give customers one link to order and pay. Gbam keeps your WhatsApp orders organised and your payments safe.",
};

export default async function HomePage() {
  // The fee shown comes from Admin → Settings, so read it on each visit (not at build time).
  await connection();
  const fees = await liveFees();
  return (
    <>
      <Hero />
      <HowItWorks />
      <Features />
      <SellersCollage />
      <PricingTeaser fees={fees} />
      <FaqHighlights fees={fees} />
      <CtaBand />
    </>
  );
}
