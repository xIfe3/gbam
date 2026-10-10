import type { Metadata } from "next";
import { connection } from "next/server";
import { CtaBand } from "@/components/brand/cta-band";
import { liveFees } from "@/lib/fees";
import { getMarketing } from "@/lib/marketing";
import { FaqHighlights } from "./home/faq-highlights";
import { Features } from "./home/features";
import { Hero } from "./home/hero";
import { HowItWorks } from "./home/how-it-works";
import { PricingTeaser } from "./home/pricing-teaser";
import { SellersCollage } from "./home/sellers-collage";

/** The description comes from Admin → Content → Marketing pages (today's text until edited). */
export async function generateMetadata(): Promise<Metadata> {
  const fields = await getMarketing("home");
  return {
    title: { absolute: "Gbam: take orders and get paid on WhatsApp" },
    description: fields.seoDescription,
  };
}

export default async function HomePage() {
  // The fee shown comes from Admin → Settings, so read it on each visit (not at build time).
  await connection();
  const fees = await liveFees();
  const home = await getMarketing("home");
  return (
    <>
      <Hero fields={home} />
      <HowItWorks />
      <Features />
      <SellersCollage />
      <PricingTeaser fees={fees} />
      <FaqHighlights fees={fees} />
      <CtaBand />
    </>
  );
}
