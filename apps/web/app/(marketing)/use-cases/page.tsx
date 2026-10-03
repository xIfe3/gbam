import type { Metadata } from "next";
import { BentoGrid, BentoTile } from "@/components/brand/bento";
import { CtaBand } from "@/components/brand/cta-band";
import { PageHeader } from "@/components/brand/page-header";
import { Photo } from "@/components/brand/photo";

export const metadata: Metadata = {
  title: "Use cases",
  description: "How food sellers, fashion sellers, beauty sellers and more can use Gbam.",
};

// Each story is an illustration of how a seller could use Gbam, not a real customer.
const CASES = [
  {
    name: "Food & drinks",
    photo: "food vendor serving jollof rice",
    story:
      "Put today's menu on your shop link. Customers order and pay before you start cooking, and a WhatsApp message tells them when it is on its way.",
  },
  {
    name: "Fashion",
    photo: "fashion seller holding a dress",
    story:
      "Share one link instead of sending photos one by one. Customers pick items and pay, and you pack only paid orders.",
  },
  {
    name: "Beauty",
    photo: "beauty seller with skincare products",
    story:
      "List your products with prices once. Repeat customers reorder from the same link whenever they like.",
  },
  {
    name: "Phones & gadgets",
    photo: "phone and gadget seller at a counter",
    story:
      "Accessories, chargers and more on one page. Payment is confirmed by Paystack before you hand anything over.",
  },
  {
    name: "Cakes & catering",
    photo: "baker decorating a cake",
    story:
      "Take payment up front for each order so your time goes into baking, not chasing transfers.",
  },
  {
    name: "Thrift",
    photo: "thrift seller sorting clothes",
    story: "Post a link with the pieces you have, take payment, and mark each order as sent out.",
  },
];

export default function UseCasesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Use cases"
        title="Made for every kind of seller"
        lead="If your customers already message you on WhatsApp to order, Gbam can take over the payment chasing."
        photo={{ description: "seller packing orders for delivery" }}
      />
      <div className="mx-auto max-w-5xl px-4">
        <BentoGrid>
          {CASES.map((item) => (
            <BentoTile key={item.name} title={item.name}>
              <Photo description={item.photo} className="mb-3 h-40 w-full" />
              <p className="text-ink-muted">{item.story}</p>
            </BentoTile>
          ))}
        </BentoGrid>
      </div>
      <CtaBand />
    </>
  );
}
