/* eslint-disable @next/next/no-img-element -- thumbnails are small WebP files from our own storage */
import { formatNaira } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { api, type ProductListItem } from "@/lib/api";

export const metadata: Metadata = {
  title: "Products",
  description: "Your Gbam products.",
};

type Show = "all" | "showing" | "hidden";

/** The filter tabs above the list. The ?show= value is the part after "show=". */
const FILTERS: { show: Show; label: string; href: string }[] = [
  { show: "all", label: "All", href: "/dashboard/products" },
  { show: "showing", label: "Showing", href: "/dashboard/products?show=showing" },
  { show: "hidden", label: "Hidden", href: "/dashboard/products?show=hidden" },
];

// At or below this many left (when stock is tracked) the row gets a "Low stock" pill.
const LOW_STOCK_AT = 5;

/** Only accept the three known values; anything else means "all". */
function parseShow(value: string | string[] | undefined): Show {
  if (value === "showing" || value === "hidden") {
    return value;
  }
  return "all";
}

/** "₦12,000 – ₦15,000", or "₦12,000" when every variant costs the same. */
function priceText(product: ProductListItem): string {
  if (product.minPriceKobo === product.maxPriceKobo) {
    return formatNaira(product.minPriceKobo);
  }
  return `${formatNaira(product.minPriceKobo)} – ${formatNaira(product.maxPriceKobo)}`;
}

/** "3 variants · 12 left" or "1 variant · Not tracked". */
function stockText(product: ProductListItem): string {
  let variants = `${product.variantCount} variants`;
  if (product.variantCount === 1) {
    variants = "1 variant";
  }
  if (product.totalStock === null) {
    return `${variants} · Not tracked`;
  }
  return `${variants} · ${product.totalStock} left`;
}

function isLowStock(product: ProductListItem): boolean {
  if (product.totalStock === null) {
    return false;
  }
  return product.totalStock <= LOW_STOCK_AT;
}

const PILL = "rounded-full px-2.5 py-0.5 text-xs font-medium";

/** /dashboard/products: the seller's product list (server component, reads the API directly). */
export default async function ProductsPage(props: PageProps<"/dashboard/products">) {
  const searchParams = await props.searchParams;
  const show = parseShow(searchParams.show);

  const allProducts = await api.listProducts();

  // The API returns every non-archived product; the tabs filter here.
  const products: ProductListItem[] = [];
  for (const product of allProducts) {
    if (show === "all") {
      products.push(product);
    } else if (show === "showing" && product.status === "active") {
      products.push(product);
    } else if (show === "hidden" && product.status === "hidden") {
      products.push(product);
    }
  }

  return (
    <main>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-ink text-xl font-bold">Products</h1>
        <Link
          href="/dashboard/products/new"
          className="bg-brand text-ink focus-visible:outline-brand flex min-h-11 items-center rounded-full px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Add product
        </Link>
      </div>

      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter products">
        {FILTERS.map((filter) => (
          <Link
            key={filter.show}
            href={filter.href}
            aria-current={filter.show === show ? "page" : undefined}
            className="border-brand-tint text-ink focus-visible:outline-brand flex min-h-11 shrink-0 items-center rounded-full border-2 px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:bg-brand-tint aria-[current=page]:font-bold"
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {products.length === 0 && show === "all" && (
        <div className="border-brand-tint rounded-xl border-2 border-dashed p-8 text-center">
          <p className="text-ink mb-4 font-bold">No products yet</p>
          <Link
            href="/dashboard/products/new"
            className="bg-brand text-ink focus-visible:outline-brand inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Add your first product
          </Link>
        </div>
      )}

      {products.length === 0 && show !== "all" && (
        <p className="border-brand-tint text-ink-muted rounded-xl border-2 border-dashed p-8 text-center">
          No products in this view.
        </p>
      )}

      {products.length > 0 && (
        <ul className="border-brand-tint divide-brand-tint divide-y-2 rounded-xl border-2 bg-white">
          {products.map((product) => {
            const hasOptionsOn = product.variantCount > 0;
            return (
              <li key={product.id}>
                <Link
                  href={`/dashboard/products/${product.id}`}
                  className="hover:bg-blush focus-visible:outline-brand flex items-center gap-3 p-3 focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  {product.mainPhotoUrl && (
                    <img
                      src={product.mainPhotoUrl}
                      alt=""
                      className="size-14 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  {!product.mainPhotoUrl && (
                    <div
                      aria-hidden="true"
                      className="bg-coral-wash border-coral-tint size-14 shrink-0 rounded-lg border"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate font-bold">{product.name}</p>
                    {hasOptionsOn && (
                      <p className="text-ink-muted truncate text-sm">{stockText(product)}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {hasOptionsOn && (
                      <span className="text-ink text-sm font-bold tabular-nums">
                        {priceText(product)}
                      </span>
                    )}
                    {!hasOptionsOn && (
                      <span className="text-ink-muted text-sm">No options switched on</span>
                    )}
                    <div className="flex gap-1">
                      {isLowStock(product) && (
                        <span className={`${PILL} bg-coral-wash text-coral-deep`}>Low stock</span>
                      )}
                      {product.status === "active" && (
                        <span className={`${PILL} bg-brand-tint text-ink`}>Showing</span>
                      )}
                      {product.status === "hidden" && (
                        <span className={`${PILL} border-ink-subtle text-ink-muted border`}>
                          Hidden
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
