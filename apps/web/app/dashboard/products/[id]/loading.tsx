import { LoadingScreen, Skeleton } from "@/components/brand/skeleton";

/** Shown instantly while a product's details load. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading the product…">
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="mb-2 h-8 w-2/3" />
      <Skeleton className="mb-6 h-5 w-1/3" />
      <div className="mb-6 flex gap-3">
        <Skeleton className="size-40 shrink-0 rounded-2xl" />
        <Skeleton className="size-40 shrink-0 rounded-2xl" />
      </div>
      <div className="mb-6 flex gap-2">
        <Skeleton className="h-11 w-20 rounded-full" />
        <Skeleton className="h-11 w-32 rounded-full" />
      </div>
      <Skeleton className="h-40 rounded-xl" />
    </LoadingScreen>
  );
}
