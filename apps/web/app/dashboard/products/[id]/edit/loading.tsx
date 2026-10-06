import { LoadingScreen, ProductFormSkeleton } from "@/components/brand/skeleton";

/** Shown instantly while a product opens for editing. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading the product…">
      <ProductFormSkeleton />
    </LoadingScreen>
  );
}
