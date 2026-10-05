import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { api, ApiError } from "@/lib/api";
import { EditProductForm } from "../editor/edit-product-form";

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
  return { title: product.name, description: `Edit ${product.name}.` };
}

/** /dashboard/products/[id]: edit one product on a single page. */
export default async function EditProductPage(props: PageProps<"/dashboard/products/[id]">) {
  const { id } = await props.params;
  const product = await loadProduct(id);

  return (
    <main className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/products"
          className="text-ink-muted focus-visible:outline-brand inline-flex min-h-11 items-center text-sm focus-visible:outline-2"
        >
          ← All products
        </Link>
        <h1 className="text-ink text-xl font-bold">Edit product</h1>
      </div>
      {/* key = version: after a reload with newer data, the form starts fresh from it. */}
      <EditProductForm key={product.version} product={product} />
    </main>
  );
}
