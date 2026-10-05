import { LoadingScreen, Skeleton, SkeletonRow } from "@/components/brand/skeleton";

/** Shown instantly while the orders list loads (Next uses loading.tsx automatically). */
export default function Loading() {
  return (
    <LoadingScreen label="Loading your orders…">
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-8 w-12 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <div className="border-brand-tint divide-brand-tint divide-y-2 rounded-xl border-2 bg-white">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </LoadingScreen>
  );
}
