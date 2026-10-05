import { formatNaira, RESERVED_SLUGS } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { api, ApiError } from "@/lib/api";
import { ProductView } from "./product-view";

async function loadProduct(slug: string, productSlug: string) {
  if (RESERVED_SLUGS.has(slug)) notFound();
  try {
    return await api.storefrontProduct(slug, productSlug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata(props: PageProps<"/[slug]/[product]">): Promise<Metadata> {
  const { slug, product: productSlug } = await props.params;
  const { store, product } = await loadProduct(slug, productSlug);

  let lowest = product.variants[0]?.priceKobo ?? 0;
  let highest = lowest;
  for (const variant of product.variants) {
    if (variant.priceKobo < lowest) lowest = variant.priceKobo;
    if (variant.priceKobo > highest) highest = variant.priceKobo;
  }
  let price = formatNaira(lowest);
  if (lowest !== highest) {
    price = `from ${price}`;
  }

  const metadata: Metadata = {
    title: `${product.name} · ${store.businessName}`,
    description: `${product.name} at ${price}. Order from ${store.businessName} and get updates on WhatsApp.`,
  };
  const mainImage = product.images[0];
  if (mainImage) {
    metadata.openGraph = { images: [mainImage.largeUrl] };
  }
  return metadata;
}

/** One product at gbam.app/{slug}/{product}. */
export default async function ProductPage(props: PageProps<"/[slug]/[product]">) {
  const { slug, product: productSlug } = await props.params;
  const { store, product } = await loadProduct(slug, productSlug);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <Logo size="sm" />
        <Link
          href={`/${store.slug}`}
          className="text-brand focus-visible:outline-brand mt-4 inline-flex min-h-11 items-center font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          ← {store.businessName}
        </Link>
      </header>
      <ProductView product={product} />
      <footer className="text-ink-muted mt-10 text-sm">
        Powered by <span className="font-display text-brand font-black">Gbam.</span> Payments by
        Paystack.
      </footer>
    </main>
  );
}
