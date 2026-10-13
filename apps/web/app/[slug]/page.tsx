import { formatNaira, RESERVED_SLUGS } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/brand/empty-state";
import { ShopCover } from "@/components/shop/shop-cover";
import { api, ApiError } from "@/lib/api";
import { redirectIfShopMoved } from "@/lib/shop-moved";
import { BasketBar } from "./basket-bar";
import { PoweredByGbam } from "./powered-by";
import { Beacon } from "@/components/beacon";

async function loadStore(slug: string) {
  if (RESERVED_SLUGS.has(slug)) notFound();
  try {
    return await api.storefront(slug);
  } catch (error) {
    // An old link of a shop that changed its link: send the visitor to the new one.
    redirectIfShopMoved(error, (moved) => `/${moved}`);
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
    <main className="mx-auto max-w-5xl px-4 py-8">
      {paidCode && (
        <p role="status" className="bg-brand-tint text-ink mb-6 rounded-2xl p-4">
          Thanks! We&apos;re confirming your payment for <strong>{paidCode}</strong>. You&apos;ll
          get a WhatsApp message once it&apos;s confirmed.
        </p>
      )}
      <ShopCover
        businessName={store.businessName}
        logoUrl={store.logoUrl ?? null}
        bannerUrl={store.bannerUrl ?? null}
      >
        <p className="text-ink-muted mt-2">
          Pick something you like. You&apos;ll get updates on WhatsApp.
        </p>
      </ShopCover>
      {store.suspended === true && (
        <EmptyState
          art={
            <span aria-hidden="true" className="text-4xl">
              ⏸️
            </span>
          }
          title="This shop isn't taking orders right now"
          description="Please check back later, or message the seller on WhatsApp."
        />
      )}
      {/* No bank account yet: products are shown, but checkout would be refused. */}
      {/* Only with products: an empty new shop already says "still setting up" below. */}
      {store.suspended !== true && store.acceptingOrders === false && products.length > 0 && (
        <EmptyState
          art={
            <span aria-hidden="true" className="text-4xl">
              🕒
            </span>
          }
          title="This shop isn't taking orders yet"
          description="Have a look around, and message the seller on WhatsApp to order."
        />
      )}
      {/* A paused (suspended) shop shows only the notice above. */}
      {store.suspended !== true &&
        (products.length === 0 ? (
          <EmptyState
            art={
              <span aria-hidden="true" className="text-4xl">
                🛍️
              </span>
            }
            title="This shop is still setting up"
            description="Check back soon, or message the seller on WhatsApp."
          />
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => {
              let price = formatNaira(product.minPriceKobo);
              if (product.minPriceKobo !== product.maxPriceKobo) {
                price = `from ${price}`;
              }
              return (
                <li key={product.slug}>
                  <Link
                    href={`/${store.slug}/${product.slug}`}
                    className="focus-visible:outline-brand block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <div className="bg-blush relative aspect-square overflow-hidden rounded-2xl">
                      {product.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.photoUrl}
                          alt={product.name}
                          width={400}
                          height={400}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      )}
                      {product.soldOut && (
                        <span className="text-ink absolute top-2 left-2 rounded-full bg-white px-3 py-1 text-xs font-bold">
                          Sold out
                        </span>
                      )}
                    </div>
                    <h2 className="text-ink mt-2 font-bold">{product.name}</h2>
                    <p className="text-ink-muted">{price}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}
      <footer className="text-ink-muted mt-10 pb-20 text-sm">
        <PoweredByGbam shopSlug={store.slug} /> Payments by Paystack.{" "}
        <Link href="/track" className="underline">
          Track an order
        </Link>
      </footer>
      {store.acceptingOrders !== false && (
        <BasketBar shopSlug={store.slug} clearOnMount={paidCode !== null} />
      )}
      {/* Counts a visit (numbers only, no cookies). */}
      <Beacon kind="storefront" shop={store.slug} />
    </main>
  );
}
