/**
 * Loading placeholders. Next shows a route's loading.tsx the moment a link is tapped,
 * while the real page is still being fetched, so the seller sees the page's outline
 * straight away instead of a frozen screen.
 */

/** One grey block that gently pulses. Size and shape come from `className`. */
export function Skeleton({ className }: { className: string }) {
  // motion-reduce: people who asked their phone for less motion get a still block.
  return (
    <span
      aria-hidden="true"
      className={`bg-ink/10 block animate-pulse rounded-lg motion-reduce:animate-none ${className}`}
    />
  );
}

/**
 * Wraps a loading screen. role="status" makes screen readers announce `label`
 * ("Loading your products…"); the grey blocks themselves are hidden from them.
 */
export function LoadingScreen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A list row: square photo, two text lines, a price on the right. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-3">
      <Skeleton className="size-14 shrink-0" />
      <div className="flex-1">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-2 h-3 w-1/3" />
      </div>
      <Skeleton className="h-5 w-16" />
    </div>
  );
}

/** The outline of the add/edit product form: title, 4 photo tiles, fields, button. */
export function ProductFormSkeleton() {
  return (
    <div className="mx-auto max-w-xl">
      <Skeleton className="mb-6 h-7 w-1/2" />
      <Skeleton className="mb-2 h-3 w-1/4" />
      <div className="mb-6 grid grid-cols-4 gap-2">
        <Skeleton className="aspect-square" />
        <Skeleton className="aspect-square" />
        <Skeleton className="aspect-square" />
        <Skeleton className="aspect-square" />
      </div>
      <Skeleton className="mb-2 h-3 w-1/5" />
      <Skeleton className="mb-5 h-11" />
      <Skeleton className="mb-2 h-3 w-1/4" />
      <Skeleton className="mb-6 h-24" />
      <Skeleton className="h-12 rounded-full" />
    </div>
  );
}

/** A public content page loading: the page header, then a column of paragraph lines. */
export function ArticleSkeleton({ label }: { label: string }) {
  return (
    <LoadingScreen label={label}>
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="mb-4 h-10 w-3/4" />
        <Skeleton className="mb-10 h-5 w-2/3" />
        <Skeleton className="mb-3 h-4" />
        <Skeleton className="mb-3 h-4" />
        <Skeleton className="mb-3 h-4 w-5/6" />
        <Skeleton className="mb-8 h-4 w-2/3" />
        <Skeleton className="mb-3 h-4" />
        <Skeleton className="mb-3 h-4 w-4/5" />
      </div>
    </LoadingScreen>
  );
}

const LIST_ROWS = [1, 2, 3, 4];

/** A public list page loading (blog, FAQ, changelog, help): header, then cards. */
export function ListSkeleton({ label }: { label: string }) {
  return (
    <LoadingScreen label={label}>
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="mb-4 h-10 w-2/3" />
        <Skeleton className="mb-10 h-5 w-1/2" />
        <div className="flex flex-col gap-4">
          {LIST_ROWS.map((row) => (
            <div key={row} className="rounded-2xl bg-white p-5">
              <Skeleton className="mb-2 h-3 w-24" />
              <Skeleton className="mb-2 h-6 w-2/3" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ))}
        </div>
      </div>
    </LoadingScreen>
  );
}
