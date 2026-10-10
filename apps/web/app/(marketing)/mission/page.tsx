import type { Metadata } from "next";
import { BentoGrid, BentoTile } from "@/components/brand/bento";
import { CtaBand } from "@/components/brand/cta-band";
import { PageHeader } from "@/components/brand/page-header";
import { getMarketing, headerCta } from "@/lib/marketing";

/** The description comes from Admin → Content → Marketing pages (today's text until edited). */
export async function generateMetadata(): Promise<Metadata> {
  const fields = await getMarketing("mission");
  return { title: "Mission", description: fields.seoDescription };
}

export default async function MissionPage() {
  const fields = await getMarketing("mission");
  const header = fields.header;
  return (
    <>
      <PageHeader
        eyebrow={header.eyebrow}
        title={header.title}
        lead={header.lead}
        photo={{
          description: "seller relaxed after a day of paid orders",
          src: header.photoSrc,
          alt: header.photoAlt,
        }}
        cta={headerCta(header, "/signup")}
      />
      <div className="mx-auto max-w-5xl px-4">
        <BentoGrid>
          <BentoTile eyebrow="The problem" title="Orders live in chats" tint="coral" span={2}>
            A customer messages, you send an account number, they send a screenshot, you check your
            bank app, and then you update them by hand. Multiply that by every order, every day.
          </BentoTile>
          <BentoTile
            eyebrow="What Gbam changes"
            title="One link, paid before you pack"
            tint="brand"
          >
            Customers order from your shop link and pay through Paystack. You see paid orders in one
            dashboard, and WhatsApp updates go out automatically.
          </BentoTile>
          <BentoTile eyebrow="Where we are going" title="Step by step">
            We are early and building in the open. We will add things sellers ask for, and we will
            tell you what is new on our changelog.
          </BentoTile>
        </BentoGrid>
      </div>
      <CtaBand />
    </>
  );
}
