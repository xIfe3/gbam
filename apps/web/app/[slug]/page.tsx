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
  const { store, products } = await loadStore(slug);

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
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
