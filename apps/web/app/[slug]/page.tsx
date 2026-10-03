import { RESERVED_SLUGS } from "@gbam/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Checkout } from "./checkout";

async function loadStore(slug: string) {
  if (RESERVED_SLUGS.has(slug)) notFound();
  try {
    return await api.storefront(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata(props: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const { store } = await loadStore(slug);
  return { title: store.businessName };
}

/** Public storefront at gbam.app/{slug}. */
export default async function StorefrontPage(props: PageProps<"/[slug]">) {
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const { store, products } = await loadStore(slug);

  // ?paid=GB-XXXX is added by Paystack when it sends the customer back here.
  // It only shows a thank-you banner; the Paystack webhook is what actually marks the
  // order paid, so faking this URL achieves nothing.
  let paidCode: string | null = null;
  const paid = searchParams.paid;
  if (typeof paid === "string" && /^GB-[2-9A-Z]{4}$/.test(paid)) {
    paidCode = paid;
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      {paidCode && (
        <p
          role="status"
          className="mb-6 rounded-xl border border-emerald-200 bg-brand-tint p-4 text-emerald-900"
        >
          Thanks! We&apos;re confirming your payment for <strong>{paidCode}</strong>. You&apos;ll
          get a WhatsApp message once it&apos;s confirmed.
        </p>
      )}
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{store.businessName}</h1>
        <p className="text-sm text-zinc-500">Order below. You&apos;ll get updates on WhatsApp.</p>
      </header>
      {products.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-zinc-500">
          No products yet.
        </p>
      ) : (
        <Checkout slug={store.slug} products={products} />
      )}
    </main>
  );
}
