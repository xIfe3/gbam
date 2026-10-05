import { LoadingScreen, Skeleton } from "@/components/brand/skeleton";

/** Shown instantly while a product page loads: gallery, then name, price and options. */
export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <LoadingScreen label="Loading the product…">
        <Skeleton className="mb-6 h-4 w-32" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Skeleton className="aspect-square rounded-2xl" />
          <div className="min-w-0">
            <Skeleton className="mb-3 h-8 w-3/4" />
            <Skeleton className="mb-6 h-6 w-1/3" />
            <Skeleton className="mb-2 h-3 w-16" />
            <div className="mb-5 flex gap-2">
              <Skeleton className="h-11 w-14 rounded-full" />
              <Skeleton className="h-11 w-14 rounded-full" />
              <Skeleton className="h-11 w-14 rounded-full" />
            </div>
            <Skeleton className="h-12 rounded-full" />
          </div>
        </div>
      </LoadingScreen>
    </main>
  );
}
