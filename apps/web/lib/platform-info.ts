import type { PublicPlatformInfo } from "@gbam/shared";

/** How long one answer is reused (the API caches maintenance for 10 seconds too). */
const CACHE_MS = 10_000;
/** Don't hold a page up waiting: give up after 2 seconds. */
const TIMEOUT_MS = 2_000;

let cache: { value: PublicPlatformInfo; fetchedAt: number } | null = null;

function apiBase(): string {
  const fromEnv = process.env.API_URL;
  if (fromEnv) {
    return fromEnv;
  }
  return "http://localhost:4000";
}

/**
 * Public platform facts from the API (maintenance mode, WhatsApp number, fee, sign-ups open),
 * reused for 10 seconds. Used by proxy.ts on every page, so it must be cheap.
 *
 * If the API can't be reached it returns null and callers carry on as normal ("fail open"):
 * a slow API should never take the whole website down with a maintenance page.
 */
export async function getPlatformInfo(): Promise<PublicPlatformInfo | null> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_MS) {
    return cache.value;
  }
  try {
    const res = await fetch(`${apiBase()}/platform/public`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    const value = (await res.json()) as PublicPlatformInfo;
    cache = { value, fetchedAt: now };
    return value;
  } catch {
    return null;
  }
}

/** For tests: forget the cached answer. */
export function clearPlatformInfoCache(): void {
  cache = null;
}
