import {
  resolveMarketing,
  type MarketingFields,
  type MarketingPage,
  type PageHeaderFields,
} from "@gbam/shared";
import { connection } from "next/server";
import { apiUrl } from "./api";

/** A publish shows on the site within a minute. */
const CACHE_MS = 60_000;
/** When the API is down, try again sooner than that. */
const FAILURE_CACHE_MS = 10_000;
const TIMEOUT_MS = 2_000;

const cache = new Map<MarketingPage, { value: unknown; fetchedAt: number; ttl: number }>();

/**
 * A marketing page's words and photos (edited in Admin → Content → Marketing pages).
 * Reused for a minute; if the API can't be reached, today's defaults, so the page always
 * shows. Calling it makes the page render on each request instead of once at build time.
 */
export async function getMarketing<P extends MarketingPage>(page: P): Promise<MarketingFields<P>> {
  // connection(): "this page needs a live request", so Next doesn't freeze it at build time.
  await connection();
  const now = Date.now();
  const cached = cache.get(page);
  if (cached && now - cached.fetchedAt < cached.ttl) {
    return resolveMarketing(page, cached.value);
  }
  let value: unknown = null;
  let ttl = FAILURE_CACHE_MS;
  try {
    const res = await fetch(`${apiUrl()}/content/marketing/${page}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      value = await res.json();
      ttl = CACHE_MS;
    }
  } catch {
    value = null;
  }
  cache.set(page, { value, fetchedAt: now, ttl });
  // Checked again here too: whatever comes back, each field is valid or today's default.
  return resolveMarketing(page, value);
}

/** The header's button, or none when its label is empty. */
export function headerCta(header: PageHeaderFields, href: string) {
  if (header.ctaLabel === "") {
    return undefined;
  }
  return { href, label: header.ctaLabel };
}

/** For tests: forget cached answers. */
export function clearMarketingCache(): void {
  cache.clear();
}
