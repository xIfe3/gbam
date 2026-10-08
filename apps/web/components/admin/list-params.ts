/**
 * List pages keep their search, filters and page number in the address bar (?q=…&page=2),
 * so a filtered view can be bookmarked or sent to a colleague, and Back works.
 */

export type ListFilters = Record<string, string | undefined>;

/** The link to one page of a list, keeping the current filters. Empty filters are left out. */
export function pageHref(basePath: string, filters: ListFilters, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "" && key !== "page") {
      params.set(key, value);
    }
  }
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

/** One search parameter as text ("" when missing; the first value when repeated). */
export function param(
  searchParams: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const value = searchParams[name];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  if (value === undefined) {
    return "";
  }
  return value;
}

/** The ?page= number, at least 1. */
export function pageNumber(searchParams: Record<string, string | string[] | undefined>): number {
  const page = Number(param(searchParams, "page"));
  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }
  return page;
}
