import { LoadingScreen, ProductFormSkeleton } from "@/components/brand/skeleton";

/** Shown instantly after tapping "Add product", while the form loads. */
export default function Loading() {
  return (
    <LoadingScreen label="Opening the product form…">
      <ProductFormSkeleton />
    </LoadingScreen>
  );
}
