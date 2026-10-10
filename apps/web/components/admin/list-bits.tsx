import Link from "next/link";
import { pageHref, type ListFilters } from "./list-params";

/** "Page 2 of 7" with Previous/Next links that keep the current filters. */
export function Pagination({
  basePath,
  filters,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  filters: ListFilters;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1) {
    return <p className="text-ink-muted text-sm">{total} found</p>;
  }
  return (
    <nav aria-label="Pages" className="flex items-center gap-4 text-sm">
      {page > 1 && (
        <Link href={pageHref(basePath, filters, page - 1)} className="font-bold underline">
          Previous
        </Link>
      )}
      <span>
        Page {page} of {pages} ({total} found)
      </span>
      {page < pages && (
        <Link href={pageHref(basePath, filters, page + 1)} className="font-bold underline">
          Next
        </Link>
      )}
    </nav>
  );
}

export const filterInputClasses = "min-h-11 rounded-lg border-2 border-zinc-200 bg-white px-2";

// The filter bar is a client component (it opens as a bottom sheet on phones).
export { FilterBar } from "./filter-bar";

/** "Today 09:12" style time for tables (Lagos time). */
export function shortTime(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  });
}
