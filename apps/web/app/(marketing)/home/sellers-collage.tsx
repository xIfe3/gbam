import { Photo } from "@/components/brand/photo";

const SELLERS = [
  { description: "food vendor serving jollof rice", label: "Food & drinks" },
  { description: "fashion seller holding a dress", label: "Fashion" },
  { description: "beauty seller with skincare products", label: "Beauty" },
  { description: "phone and gadget seller at a counter", label: "Phones & gadgets" },
  { description: "baker decorating a cake", label: "Cakes & catering" },
  { description: "thrift seller sorting clothes", label: "Thrift" },
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
            <Photo description={seller.description} className="h-40 w-full" />
            <p className="text-ink mt-2 text-center text-sm font-bold">{seller.label}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
