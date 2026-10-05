import { LoadingScreen, Skeleton } from "@/components/brand/skeleton";

/** Shown instantly while the basket page opens (instead of the shop's product-grid outline). */
export default function Loading() {
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <LoadingScreen label="Opening your basket…">
        <Skeleton className="mb-6 h-8 w-1/2" />
        <Skeleton className="mb-3 h-20" />
        <Skeleton className="mb-6 h-20" />
        <Skeleton className="mb-2 h-3 w-1/4" />
        <Skeleton className="mb-4 h-11" />
        <Skeleton className="h-12 rounded-full" />
      </LoadingScreen>
    </main>
  );
}
