import type { Metadata } from "next";
import { BentoGrid, BentoTile } from "@/components/brand/bento";
import { CtaBand } from "@/components/brand/cta-band";
import { PageHeader } from "@/components/brand/page-header";
import { getMarketing, headerCta } from "@/lib/marketing";

/** The description comes from Admin → Content → Marketing pages (today's text until edited). */
export async function generateMetadata(): Promise<Metadata> {
  const fields = await getMarketing("about");
  return { title: "About", description: fields.seoDescription };
}

export default async function AboutPage() {
  const fields = await getMarketing("about");
  const header = fields.header;
  return (
    <>
      <PageHeader
        eyebrow={header.eyebrow}
        title={header.title}
        lead={header.lead}
        photo={{
          description: "small business owner at work with her phone",
          src: header.photoSrc,
          alt: header.photoAlt,
        }}
        cta={headerCta(header, "/signup")}
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
