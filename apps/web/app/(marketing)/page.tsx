import type { Metadata } from "next";
import { CtaBand } from "@/components/brand/cta-band";
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

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Features />
      <SellersCollage />
      <PricingTeaser />
      <FaqHighlights />
      <CtaBand />
    </>
  );
}
