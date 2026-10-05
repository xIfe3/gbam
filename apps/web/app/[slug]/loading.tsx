import { LoadingScreen, Skeleton } from "@/components/brand/skeleton";

const CARDS = [1, 2, 3, 4];

/** Shown instantly while a shop loads for a customer: the grid of product cards. */
export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <LoadingScreen label="Loading the shop…">
        <Skeleton className="mb-6 h-6 w-20" />
        <Skeleton className="mb-3 h-9 w-2/3" />
        <Skeleton className="mb-8 h-4 w-1/2" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {CARDS.map((card) => (
            <div key={card}>
              <Skeleton className="aspect-square rounded-2xl" />
              <Skeleton className="mt-2 h-4 w-3/4" />
              <Skeleton className="mt-2 h-4 w-1/2" />
            </div>
          ))}
        </div>
      </LoadingScreen>
    </main>
  );
}
