import { LoadingScreen, Skeleton, SkeletonRow } from "@/components/brand/skeleton";

/** Shown instantly while the products list loads. Same shape as the real list rows. */
export default function Loading() {
  return (
    <LoadingScreen label="Loading your products…">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-11 w-36 rounded-full" />
      </div>
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-11 w-14 rounded-full" />
        <Skeleton className="h-11 w-24 rounded-full" />
        <Skeleton className="h-11 w-20 rounded-full" />
      </div>
      <div className="border-brand-tint divide-brand-tint divide-y-2 rounded-xl border-2 bg-white">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </LoadingScreen>
  );
}
