import { RESERVED_SLUGS } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { ShopHeader } from "../shop-header";
import { BasketView } from "./basket-view";

async function loadStore(slug: string) {
  if (RESERVED_SLUGS.has(slug)) notFound();
  try {
    return await api.storefront(slug);
  } catch (error) {
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
      <ShopHeader shopSlug={store.slug} businessName={store.businessName} />
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
        <BasketView shopSlug={store.slug} businessName={store.businessName} />
        <footer className="text-ink-muted mt-10 text-sm">
          Powered by <span className="font-display text-brand font-black">Gbam.</span> Payments by
          Paystack.{" "}
          <Link href="/track" className="underline">
            Track an order
          </Link>
        </footer>
      </main>
    </>
  );
}
