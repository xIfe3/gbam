import { formatNaira } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ShopHeader } from "@/app/[slug]/shop-header";
import { PayNowButton } from "@/app/track/[code]/pay-now-button";
import { api, ApiError, type TrackedOrder } from "@/lib/api";

// Private page (the address holds the order's key): out of search results, and the key is
// never passed on to other sites.
export const metadata: Metadata = {
  title: "Review & pay",
  robots: { index: false },
  referrer: "no-referrer",
};

/**
 * /pay/GB-7K3Q?k=…: the link in the WhatsApp payment request. The customer sees exactly
 * what they're paying for, from which shop, before Paystack's pop-up opens.
 */
export default async function PayPage(props: PageProps<"/pay/[code]">) {
  const { code } = await props.params;
  const searchParams = await props.searchParams;
  const key = searchParams.k;
  if (typeof key !== "string" || key === "") {
    redirect("/track");
  }

  let tracked: TrackedOrder;
  try {
    tracked = await api.trackView(code, key);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
  const { shop, order } = tracked;
  const trackingHref = `/track/${order.code}?k=${encodeURIComponent(key)}`;
  // Already paid, cancelled, …: nothing to pay, so show where the order is instead.
  if (!tracked.canPay) {
    redirect(trackingHref);
  }

  return (
    <>
      <ShopHeader shopSlug={shop.slug} businessName={shop.businessName} />
      <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 pt-6 pb-16">
        <div>
          <p className="text-ink-muted text-sm">Review &amp; pay</p>
          <h1 className="font-display text-ink text-4xl font-black tracking-wider">{order.code}</h1>
          <p className="text-ink-muted mt-1 text-sm">From {shop.businessName}</p>
        </div>

        <section
          aria-labelledby="items-heading"
          className="border-brand-tint rounded-2xl border-2 bg-white p-5"
        >
          <h2 id="items-heading" className="text-ink mb-3 font-bold">
            What you&apos;re paying for
          </h2>
          <ul className="divide-brand-tint flex flex-col divide-y">
            {order.items.map((item, index) => {
              let name = item.productName;
              if (item.variantTitle !== "") {
                name = `${item.productName} – ${item.variantTitle}`;
              }
              return (
                <li key={index} className="flex justify-between gap-3 py-2 text-sm">
                  <span className="text-ink">
                    {item.quantity} × {name}
                  </span>
                  <span className="text-ink tabular-nums">
                    {formatNaira(item.unitPriceKobo * item.quantity)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-ink mt-3 flex justify-between text-lg font-black">
            <span>Total</span>
            <span className="tabular-nums">{formatNaira(order.totalKobo)}</span>
          </p>
        </section>

        <PayNowButton code={order.code} trackingKey={key} totalKobo={order.totalKobo} />

        <p className="text-ink-muted text-sm">
          Something not right? Message {shop.businessName} before paying, or{" "}
          <Link href={trackingHref} className="underline">
            see your order
          </Link>
          .
        </p>
      </main>
    </>
  );
}
