import { Button } from "@/components/brand/button";
import { PaymentToast } from "@/components/brand/payment-toast";
import { Photo } from "@/components/brand/photo";
import { PhoneMockup } from "@/components/brand/phone-mockup";

// The order chat shown inside the phone. All of it is example data, not a real order.
function OrderChat() {
  return (
    <>
      <div className="bg-brand flex items-center gap-2 px-2.5 pt-3 pb-2 text-[11px] text-white">
        <span
          aria-hidden="true"
          className="bg-coral-tint text-coral-deep flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-bold"
        >
          MN
        </span>
        <span>
          <b>Mama Ngozi Kitchen</b>
          <br />
          <span className="text-white/80">via Gbam</span>
        </span>
      </div>
      <div className="flex flex-col gap-1.5 p-2 text-[10px] leading-snug">
        <div className="text-ink max-w-[88%] rounded-[10px_10px_10px_3px] bg-white px-2 py-1.5">
          Hi Ada 👋 We&apos;ve received your order <b>GB-7K3Q</b>:
          <div className="text-ink-muted mt-1 flex justify-between">
            <span>2 × Jollof Rice</span>
            <span>₦7,000</span>
          </div>
          <div className="text-ink-muted flex justify-between">
            <span>1 × Chapman</span>
            <span>₦2,000</span>
          </div>
          <div className="text-ink-subtle text-right text-[8px]">12:04</div>
        </div>
        <div className="text-ink max-w-[88%] rounded-[10px_10px_10px_3px] bg-white px-2 py-1.5">
          Please pay <b>₦9,000</b> to confirm:
          <div className="bg-brand mt-1 rounded-md p-1 text-center font-bold text-white">
            Pay with Paystack
          </div>
          <div className="text-ink-subtle text-right text-[8px]">12:05</div>
        </div>
        <div className="bg-brand max-w-[80%] self-end rounded-[10px_10px_3px_10px] px-2 py-1.5 text-white">
          Done ✅<div className="text-right text-[8px] text-white/80">12:07 ✓✓</div>
        </div>
        <div className="text-ink max-w-[88%] rounded-[10px_10px_10px_3px] bg-white px-2 py-1.5">
          Payment received. Thank you! Your order is being prepared 🍲
          <div className="text-ink-subtle text-right text-[8px]">12:07</div>
        </div>
      </div>
    </>
  );
}

export function Hero() {
  return (
    <section className="bg-blush overflow-hidden px-4 pt-10 pb-14 text-center">
      <h1 className="font-display text-ink mx-auto text-5xl leading-none font-black tracking-tight sm:text-6xl md:text-7xl">
        Sell on WhatsApp.
        <br />
        Get paid. <span className="text-coral-deep">Gbam.</span>
      </h1>
      <p className="text-ink-muted mx-auto mt-4 max-w-md text-base leading-relaxed">
        One link for your whole shop. Customers order and pay with Paystack, get updates on
        WhatsApp, and you just pack and deliver.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button href="/signup" variant="primary" size="lg">
          Start selling free
        </Button>
        <Button href="/how-it-works" variant="ghost" size="lg">
          See how it works →
        </Button>
      </div>
      <p className="text-ink-muted mt-3 text-xs">
        Free for founding sellers · No app to install · Payments by Paystack
      </p>

      <div className="mt-10 flex items-center justify-center gap-3.5">
        {/* Side photos only from md up: on a phone the chat mockup gets the whole width. */}
        <div className="hidden flex-col gap-3.5 md:flex">
          <Photo
            description="food vendor at her stall"
            priority
            src="/images/home/food-vendor.webp"
            alt="A woman frying plantain at her market stall"
            className="h-[150px] w-[120px]"
          />
          <Photo
            description="delivery rider"
            priority
            src="/images/home/delivery-okada.webp"
            alt="A motorbike ready for deliveries"
            className="h-[110px] w-[120px]"
          />
        </div>
        <div className="hidden md:block">
          <Photo
            description="fashion seller packing orders"
            priority
            src="/images/home/fashion-seller.webp"
            alt="A smiling tailor at his sewing machine, phone in hand"
            className="h-60 w-[130px]"
          />
        </div>

        <div className="relative">
          <PhoneMockup>
            <OrderChat />
          </PhoneMockup>
          <div className="absolute top-8 -right-6 md:-right-28">
            <PaymentToast amountKobo={600_000} code="GB-2MPX" />
          </div>
          <div className="text-ink absolute bottom-14 -left-6 rounded-2xl bg-white px-3 py-2 text-left text-xs whitespace-nowrap shadow-xl shadow-ink/15 md:-left-28">
            🛵 <b className="text-brand">3 orders</b> out for delivery
          </div>
        </div>

        <div className="hidden md:block">
          <Photo
            description="customer paying on her phone"
            priority
            src="/images/home/customer-paying.webp"
            alt="A happy customer pointing at her phone"
            className="h-60 w-[130px]"
          />
        </div>
        <div className="hidden flex-col gap-3.5 md:flex">
          <Photo
            description="phone accessories seller"
            priority
            src="/images/home/shop-seller.webp"
            alt="A shop owner at her counter"
            className="h-[110px] w-[120px]"
          />
          <Photo
            description="happy seller counting orders"
            priority
            src="/images/home/happy-seller.webp"
            alt="A fruit seller smiling at an order on her phone"
            className="h-[150px] w-[120px]"
          />
        </div>
      </div>
    </section>
  );
}
