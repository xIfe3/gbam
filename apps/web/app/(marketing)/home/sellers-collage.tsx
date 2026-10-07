import { Photo } from "@/components/brand/photo";

// Photos: free Unsplash licence (no credit required). Sources are listed in
// public/images/home/CREDITS.md.
const SELLERS = [
  {
    description: "food vendor serving suya",
    label: "Food & drinks",
    src: "/images/home/food-drinks.webp",
    alt: "Suya cooking on a roadside grill",
  },
  {
    description: "fashion seller's fabrics",
    label: "Fashion",
    src: "/images/home/fashion.webp",
    alt: "Stacks of colourful Ankara fabric",
  },
  {
    description: "beauty seller with skincare products",
    label: "Beauty",
    src: "/images/home/beauty.webp",
    alt: "A woman smiling as she puts on face cream",
  },
  {
    description: "phone and gadget repairer at work",
    label: "Phones & gadgets",
    src: "/images/home/phones-gadgets.webp",
    alt: "A technician repairing a phone under a magnifier",
  },
  {
    description: "baker at work",
    label: "Cakes & catering",
    src: "/images/home/cakes-catering.webp",
    alt: "A baker in a chef's hat mixing a cake",
  },
  {
    description: "thrift seller's clothes on display",
    label: "Thrift",
    src: "/images/home/thrift.webp",
    alt: "Clothes and fabrics on display at a market",
  },
];

export function SellersCollage() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <h2 className="font-display text-ink mb-8 text-center text-3xl font-black sm:text-4xl">
        Made for every kind of seller
      </h2>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {SELLERS.map((seller) => (
          <li key={seller.label}>
            <Photo
              description={seller.description}
              src={seller.src}
              alt={seller.alt}
              className="h-40 w-full"
            />
            <p className="text-ink mt-2 text-center text-sm font-bold">{seller.label}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
