import { LoadingScreen, Skeleton } from "@/components/brand/skeleton";

/** Shown instantly while one order loads. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading the order…">
      <Skeleton className="mb-2 h-7 w-1/3" />
      <Skeleton className="mb-6 h-4 w-1/2" />
      <div className="border-brand-tint space-y-3 rounded-xl border-2 bg-white p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="mt-6 h-11 w-40 rounded-full" />
    </LoadingScreen>
  );
}
