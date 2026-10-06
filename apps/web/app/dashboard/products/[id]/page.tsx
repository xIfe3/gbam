/* eslint-disable @next/next/no-img-element -- photos are WebP files from our own storage */
import { formatNaira } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { api, ApiError, type ProductDetail } from "@/lib/api";
import { SITE_URL } from "@/lib/site";
import { CopyLinkButton } from "../../copy-link-button";
import { priceRangeText, stockLabel, summaryText } from "./product-summary";
import { StatusToggle } from "./status-toggle";

// cache() remembers the result for the rest of this request, so generateMetadata and the
// page share one API call instead of making two.
const loadProduct = cache(async (id: string) => {
  try {
    return await api.getProduct(id);
  } catch (error) {
    // 400 = not a UUID, 404 = not this seller's product, or archived. All look the same.
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }
});

export async function generateMetadata(
  props: PageProps<"/dashboard/products/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const product = await loadProduct(id);
  return { title: product.name, description: `${product.name}: photos, prices and stock.` };
}

const BUTTON =
  "border-brand-tint text-ink hover:bg-brand-tint focus-visible:outline-brand inline-flex min-h-11 items-center rounded-full border-2 bg-white px-5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2";
const PILL = "rounded-full px-2.5 py-0.5 text-xs font-medium";

type Variant = ProductDetail["variants"][number];

/** The variant's own photo if it has one (small size), else nothing. */
function variantPhoto(product: ProductDetail, variant: Variant): string | null {
  if (variant.imageId === null) {
    return null;
  }
  for (const image of product.images) {
    if (image.id === variant.imageId) {
      return image.smallUrl;
    }
  }
  return null;
}

/** Colour of the stock text: coral-deep for sold out, muted when not tracked. */
function stockClass(variant: Variant): string {
  if (variant.stock === 0) {
    return "text-coral-deep font-bold";
  }
  if (variant.stock === null) {
    return "text-ink-muted";
  }
  return "text-ink";
}

/** /dashboard/products/[id]: a read-only look at one product and all its variants. */
export default async function ProductDetailsPage(props: PageProps<"/dashboard/products/[id]">) {
  const { id } = await props.params;
  const product = await loadProduct(id);
  const user = await api.currentUser();

  let productUrl: string | null = null;
  if (user.seller) {
    productUrl = `${SITE_URL}/${user.seller.slug}/${product.slug}`;
  }
  const hasOptions = product.options.length > 0;
  const onlyVariant = product.variants[0];
  let toggleStatus: "active" | "hidden" = "active";
  if (product.status === "hidden") {
    toggleStatus = "hidden";
  }
  let variantsHeading = "Price and stock";
  if (hasOptions) {
    variantsHeading = "Variants";
  }

  return (
    <main className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/products"
          className="text-ink-muted focus-visible:outline-brand inline-flex min-h-11 items-center text-sm focus-visible:outline-2"
        >
          ← All products
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-ink text-2xl font-black">{product.name}</h1>
          {product.status === "active" && (
            <span className={`${PILL} bg-brand-tint text-ink`}>Showing</span>
          )}
          {product.status === "hidden" && (
            <span className={`${PILL} border-ink-subtle text-ink-muted border`}>Hidden</span>
          )}
        </div>
        <p className="text-ink mt-1 text-lg font-bold tabular-nums">
          {priceRangeText(product.variants)}
        </p>
      </div>

      {product.images.length > 0 && (
        <ul aria-label="Photos" className="flex snap-x gap-3 overflow-x-auto pb-2">
          {product.images.map((image, index) => (
            <li key={image.id} className="relative shrink-0 snap-start">
              <img
                src={image.largeUrl}
                alt={`${product.name}, photo ${index + 1}`}
                width={220}
                height={220}
                className="size-40 rounded-2xl object-cover sm:size-56"
              />
              {index === 0 && (
                <span className="bg-ink absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-bold text-white">
                  Main
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {product.description && (
        <p className="text-ink-muted whitespace-pre-line">{product.description}</p>
      )}

      <div className="flex flex-wrap items-start gap-2">
        <Link
          href={`/dashboard/products/${product.id}/edit`}
          className="bg-brand hover:bg-brand-hover focus-visible:outline-brand inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Edit
        </Link>
        {productUrl && (
          <a href={productUrl} target="_blank" rel="noopener noreferrer" className={BUTTON}>
            View in shop ↗
          </a>
        )}
        {productUrl && <CopyLinkButton url={productUrl} label="Copy product link" />}
        <StatusToggle id={product.id} status={toggleStatus} />
      </div>

      <section aria-labelledby="variants-heading" className="flex flex-col gap-3">
        <h2 id="variants-heading" className="text-ink text-lg font-bold">
          {variantsHeading}
        </h2>
        <p className="text-ink-muted text-sm">{summaryText(product.variants)}</p>

        {hasOptions && (
          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            {product.options.map((option) => (
              <div key={option.name} className="flex flex-wrap items-center gap-1.5">
                <dt className="text-ink text-sm font-bold">{option.name}</dt>
                {option.values.map((value) => (
                  <dd
                    key={value}
                    className="bg-brand-tint text-ink rounded-full px-2.5 py-0.5 text-xs"
                  >
                    {value}
                  </dd>
                ))}
              </div>
            ))}
          </dl>
        )}

        {hasOptions && (
          <div className="border-brand-tint overflow-x-auto rounded-xl border-2 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="text-ink-muted text-xs uppercase">
                <tr>
                  <th scope="col" className="p-3 font-medium">
                    Combination
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Price
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Stock
                  </th>
                </tr>
              </thead>
              <tbody className="divide-brand-tint divide-y-2">
                {product.variants.map((variant) => {
                  const photo = variantPhoto(product, variant);
                  // Switched-off combinations are faded so on-sale ones stand out.
                  let rowClass = "";
                  if (!variant.isEnabled) {
                    rowClass = "opacity-60";
                  }
                  return (
                    <tr key={variant.id} className={rowClass}>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {photo && (
                            <img
                              src={photo}
                              alt=""
                              width={32}
                              height={32}
                              className="size-8 rounded-md object-cover"
                            />
                          )}
                          <span className="text-ink font-bold">{variant.title}</span>
                          {!variant.isEnabled && (
                            <span className={`${PILL} border-ink-subtle text-ink-muted border`}>
                              Off
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-ink p-3 tabular-nums">
                        {formatNaira(variant.priceKobo)}
                      </td>
                      <td className={`p-3 ${stockClass(variant)}`}>{stockLabel(variant)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!hasOptions && onlyVariant && (
          <div className="border-brand-tint flex gap-6 rounded-xl border-2 bg-white p-4 text-sm">
            <div>
              <p className="text-ink-muted text-xs uppercase">Price</p>
              <p className="text-ink font-bold tabular-nums">
                {formatNaira(onlyVariant.priceKobo)}
              </p>
            </div>
            <div>
              <p className="text-ink-muted text-xs uppercase">Stock</p>
              <p className={stockClass(onlyVariant)}>{stockLabel(onlyVariant)}</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
