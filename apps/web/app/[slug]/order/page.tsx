import { RESERVED_SLUGS } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { redirectIfShopMoved } from "@/lib/shop-moved";
import { ShopHeader } from "../shop-header";
import { BasketView } from "./basket-view";
import { Beacon } from "@/components/beacon";
import { PoweredByGbam } from "../powered-by";

async function loadStore(slug: string) {
  if (RESERVED_SLUGS.has(slug)) notFound();
  try {
    return await api.storefront(slug);
  } catch (error) {
    // An old link of a shop that changed its link: send the visitor to the new one.
    redirectIfShopMoved(error, (moved) => `/${moved}/order`);
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata(props: PageProps<"/[slug]/order">): Promise<Metadata> {
  const { slug } = await props.params;
  const { store } = await loadStore(slug);
  return { title: `Your order · ${store.businessName}` };
}

/** The basket lives in the browser, so this page only loads the shop and hands over to BasketView. */
export default async function OrderPage(props: PageProps<"/[slug]/order">) {
  const { slug } = await props.params;
  const { store } = await loadStore(slug);

  return (
    <>
      <ShopHeader
        shopSlug={store.slug}
        businessName={store.businessName}
        logoUrl={store.logoUrl ?? null}
      />
      <Beacon kind="checkout" shop={store.slug} />
      <main className="mx-auto max-w-2xl px-4 pt-4 pb-8">
        <Link
          href={`/${store.slug}`}
          className="text-ink-muted focus-visible:outline-brand inline-flex min-h-11 items-center text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          ← Keep shopping
        </Link>
        <h1 className="font-display text-ink mt-1 mb-6 text-3xl leading-tight font-black">
          Your order
        </h1>
        <BasketView
          shopSlug={store.slug}
          businessName={store.businessName}
          delivery={store.delivery}
        />
        <footer className="text-ink-muted mt-10 text-sm">
          <PoweredByGbam shopSlug={store.slug} /> Payments by Paystack.{" "}
          <Link href="/track" className="underline">
            Track an order
          </Link>
        </footer>
      </main>
    </>
  );
}
