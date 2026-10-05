import { RESERVED_SLUGS } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { api, ApiError } from "@/lib/api";
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
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <Logo size="sm" />
        <Link
          href={`/${store.slug}`}
          className="text-brand focus-visible:outline-brand mt-4 inline-flex min-h-11 items-center font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          ← {store.businessName}
        </Link>
        <h1 className="font-display text-ink mt-2 text-3xl leading-tight font-black">Your order</h1>
      </header>
      <BasketView shopSlug={store.slug} businessName={store.businessName} />
      <footer className="text-ink-muted mt-10 text-sm">
        Powered by <span className="font-display text-brand font-black">Gbam.</span> Payments by
        Paystack.
      </footer>
    </main>
  );
}
