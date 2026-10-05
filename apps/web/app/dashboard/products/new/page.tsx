import type { Metadata } from "next";
import Link from "next/link";
import { PageTour } from "../../tours/page-tour";
import { NewProductSteps } from "../editor/new-product-steps";

export const metadata: Metadata = {
  title: "Add product",
  description: "Add a product to your Gbam shop.",
};

/** /dashboard/products/new: the 3-step add form. */
export default function NewProductPage() {
  return (
    <main className="flex flex-col gap-6">
      <PageTour tour="editor" />
      <div>
        <Link
          href="/dashboard/products"
          className="text-ink-muted focus-visible:outline-brand inline-flex min-h-11 items-center text-sm focus-visible:outline-2"
        >
          ← All products
        </Link>
        <h1 className="text-ink text-xl font-bold">Add product</h1>
      </div>
      <NewProductSteps />
    </main>
  );
}
