import type { Metadata } from "next";
import { BentoGrid, BentoTile } from "@/components/brand/bento";
import { CtaBand } from "@/components/brand/cta-band";
import { PageHeader } from "@/components/brand/page-header";
import { getMarketing, headerCta } from "@/lib/marketing";
import { Photo } from "@/components/brand/photo";

/** The description comes from Admin → Content → Marketing pages (today's text until edited). */
export async function generateMetadata(): Promise<Metadata> {
  const fields = await getMarketing("use-cases");
  return { title: "Use cases", description: fields.seoDescription };
}

// Each story is an illustration of how a seller could use Gbam, not a real customer.
// The photos are the home page's category photos (see public/images/home/CREDITS.md).
const CASES = [
  {
    name: "Food & drinks",
    photo: "food vendor serving jollof rice",
    src: "/images/home/food-drinks.webp",
    alt: "Suya cooking on a roadside grill",
    story:
      "Put today's menu on your shop link. Customers order and pay before you start cooking, and a WhatsApp message tells them when it is on its way.",
  },
  {
    name: "Fashion",
    photo: "fashion seller holding a dress",
    src: "/images/home/fashion.webp",
    alt: "Stacks of colourful Ankara fabric",
    story:
      "Share one link instead of sending photos one by one. Customers pick items and pay, and you pack only paid orders.",
  },
  {
    name: "Beauty",
    photo: "beauty seller with skincare products",
    src: "/images/home/beauty.webp",
    alt: "A woman smiling as she puts on face cream",
    story:
      "List your products with prices once. Repeat customers reorder from the same link whenever they like.",
  },
  {
    name: "Phones & gadgets",
    photo: "phone and gadget seller at a counter",
    src: "/images/home/phones-gadgets.webp",
    alt: "A technician repairing a phone under a magnifier",
    story:
      "Accessories, chargers and more on one page. Payment is confirmed by Paystack before you hand anything over.",
  },
  {
    name: "Cakes & catering",
    photo: "baker decorating a cake",
    src: "/images/home/cakes-catering.webp",
    alt: "A baker in a chef's hat mixing a cake",
    story:
      "Take payment up front for each order so your time goes into baking, not chasing transfers.",
  },
  {
    name: "Thrift",
    photo: "thrift seller sorting clothes",
    src: "/images/home/thrift.webp",
    alt: "Clothes and fabrics on display at a market",
    story: "Post a link with the pieces you have, take payment, and mark each order as sent out.",
  },
];

export default async function UseCasesPage() {
  const fields = await getMarketing("use-cases");
  const header = fields.header;
  return (
    <>
      <PageHeader
        eyebrow={header.eyebrow}
        title={header.title}
        lead={header.lead}
        photo={{
          description: "seller packing orders for delivery",
          src: header.photoSrc,
          alt: header.photoAlt,
        }}
        cta={headerCta(header, "/signup")}
      />
      <div className="mx-auto max-w-5xl px-4">
        <BentoGrid>
          {CASES.map((item) => (
            <BentoTile key={item.name} title={item.name}>
              <Photo
                description={item.photo}
                src={item.src}
                alt={item.alt}
                className="mb-3 h-40 w-full"
              />
              <p className="text-ink-muted">{item.story}</p>
            </BentoTile>
          ))}
        </BentoGrid>
      </div>
      <CtaBand />
    </>
  );
}
