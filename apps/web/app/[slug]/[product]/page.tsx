import { formatNaira, RESERVED_SLUGS } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { api, ApiError, type StorefrontProductCard } from "@/lib/api";
import { ShopHeader } from "../shop-header";
import { ProductView } from "./product-view";
import { Beacon } from "@/components/beacon";

// How many of the shop's other products to show under this one.
const MORE_COUNT = 4;

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

  const title = `${product.name} · ${store.businessName}`;
  const orderLine = `Order from ${store.businessName} and get updates on WhatsApp.`;
  // A product with no variants has no price; leave it out rather than say "₦0".
  let description = `${product.name}. ${orderLine}`;
  const firstVariant = product.variants[0];
  if (firstVariant !== undefined) {
    let lowest = firstVariant.priceKobo;
    let highest = lowest;
    for (const variant of product.variants) {
      if (variant.priceKobo < lowest) lowest = variant.priceKobo;
      if (variant.priceKobo > highest) highest = variant.priceKobo;
    }
    let price = formatNaira(lowest);
    if (lowest !== highest) {
      price = `from ${price}`;
    }
    description = `${product.name} at ${price}. ${orderLine}`;
  }

  const metadata: Metadata = { title, description };
  const mainImage = product.images[0];
  if (mainImage) {
    // Setting openGraph replaces the parent's, so title and description are repeated here.
    metadata.openGraph = { title, description, images: [mainImage.largeUrl] };
  }
  return metadata;
}

/** One product at gbam.app/{slug}/{product}. */
export default async function ProductPage(props: PageProps<"/[slug]/[product]">) {
  const { slug, product: productSlug } = await props.params;
  const { store, product } = await loadProduct(slug, productSlug);

  // The shop's other products for "More from …". Nice to have: if it fails, skip it.
  const more: StorefrontProductCard[] = [];
  try {
    const shop = await api.storefront(slug);
    for (const card of shop.products) {
      if (card.slug !== product.slug && more.length < MORE_COUNT) {
        more.push(card);
      }
    }
  } catch (error) {
    unstable_rethrow(error);
  }

  return (
    <>
      <ShopHeader shopSlug={store.slug} businessName={store.businessName} />
      <Beacon kind="product" shop={store.slug} />
      {/* pb-32 on phones: room for the "Add to order" bar pinned to the bottom. */}
      <main className="mx-auto max-w-5xl px-4 pt-4 pb-32 md:pb-12">
        <Link
          href={`/${store.slug}`}
          className="text-ink-muted focus-visible:outline-brand mb-3 inline-flex min-h-11 items-center text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          ← All products
        </Link>
        <ProductView shopSlug={store.slug} product={product} />

        {more.length > 0 && (
          <section aria-label={`More from ${store.businessName}`} className="mt-12">
            <h2 className="font-display text-ink mb-4 text-xl font-black">
              More from {store.businessName}
            </h2>
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {more.map((card) => {
                let price = formatNaira(card.minPriceKobo);
                if (card.minPriceKobo !== card.maxPriceKobo) {
                  price = `from ${price}`;
                }
                return (
                  <li key={card.slug}>
                    <Link
                      href={`/${store.slug}/${card.slug}`}
                      className="focus-visible:outline-brand block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <div className="border-brand-tint flex aspect-square items-center justify-center overflow-hidden rounded-2xl border bg-white">
                        {card.photoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={card.photoUrl}
                            alt=""
                            width={300}
                            height={300}
                            loading="lazy"
                            className="size-full object-contain p-2"
                          />
                        )}
                      </div>
                      <p className="text-ink mt-2 font-bold">{card.name}</p>
                      <p className="text-ink-muted text-sm">{price}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <footer className="text-ink-muted mt-12 text-sm">
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
