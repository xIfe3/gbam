import { RESERVED_SLUGS } from "@gbam/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
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
  return {
    title: store.businessName,
    description: `Order from ${store.businessName} and get updates on WhatsApp.`,
  };
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
        <p role="status" className="bg-brand-tint text-ink mb-6 rounded-2xl p-4">
          Thanks! We&apos;re confirming your payment for <strong>{paidCode}</strong>. You&apos;ll
          get a WhatsApp message once it&apos;s confirmed.
        </p>
      )}
      <header className="mb-6">
        <Logo size="sm" />
        <h1 className="font-display text-ink mt-6 text-4xl leading-tight font-black">
          {store.businessName}
        </h1>
        <p className="text-ink-muted mt-2">Order below. You&apos;ll get updates on WhatsApp.</p>
      </header>
      {products.length === 0 ? (
        <p className="border-brand-tint text-ink-muted rounded-2xl border-2 border-dashed p-6 text-center">
          No products yet.
        </p>
      ) : (
        <Checkout slug={store.slug} products={products} />
      )}
      <footer className="text-ink-muted mt-10 text-sm">
        Powered by <span className="font-display text-brand font-black">Gbam.</span> Payments by
        Paystack.
      </footer>
    </main>
  );
}
