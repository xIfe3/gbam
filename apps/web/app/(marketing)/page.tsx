import { CtaBand } from "@/components/brand/cta-band";
import { FaqHighlights } from "./home/faq-highlights";
import { Features } from "./home/features";
import { Hero } from "./home/hero";
import { HowItWorks } from "./home/how-it-works";
import { PricingTeaser } from "./home/pricing-teaser";
import { SellersCollage } from "./home/sellers-collage";

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
