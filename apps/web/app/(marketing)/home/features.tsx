import { BentoGrid, BentoTile } from "@/components/brand/bento";

export function Features() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <h2 className="font-display text-ink mb-8 text-center text-3xl font-black sm:text-4xl">
        Everything a WhatsApp shop needs
      </h2>
      <BentoGrid>
        <BentoTile eyebrow="Storefront" title="One link for your whole shop" tint="brand" span={2}>
          Put your products on a page of your own and share it anywhere. Customers do not need to
          install anything.
        </BentoTile>
        <BentoTile eyebrow="Payments" title="Paid with Paystack">
          Customers pay with Paystack, and the money goes to your bank account.
        </BentoTile>
        <BentoTile eyebrow="Updates" title="Automatic WhatsApp updates" tint="coral">
          Order received, payment confirmed, out for delivery: your customer hears about each step.
        </BentoTile>
        <BentoTile eyebrow="Orders" title="An order dashboard">
          See every order and its status in one place, instead of scrolling through chats.
        </BentoTile>
        <BentoTile eyebrow="Delivery" title="Delivery status">
          Mark orders as out for delivery and customers are told for you.
        </BentoTile>
      </BentoGrid>
    </section>
  );
}
