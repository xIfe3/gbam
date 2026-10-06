const DEFAULT_SITE_URL = "https://gbam.app";

/**
 * Cleans up the configured site address: blank means the real domain, a trailing "/" is
 * removed, and anything that isn't an http(s) address throws (better a failed build than
 * shop links pointing nowhere).
 */
export function siteUrlFrom(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_SITE_URL;
  }
  let text = raw.trim();
  while (text.endsWith("/")) {
    text = text.slice(0, -1);
  }
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`NEXT_PUBLIC_SITE_URL must be a full address like https://gbam.app, got "${raw}"`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`NEXT_PUBLIC_SITE_URL must start with https:// or http://, got "${raw}"`);
  }
  return text;
}

/**
 * The public address of the site: shop links, the sitemap, robots and link previews.
 * Set NEXT_PUBLIC_SITE_URL (e.g. https://gbam.zephra.dev while gbam.app isn't ready).
 * NEXT_PUBLIC_ settings are baked in when the site is BUILT, so they work in the browser too;
 * change it in Railway and redeploy to switch domains.
 */
export const SITE_URL = siteUrlFrom(process.env.NEXT_PUBLIC_SITE_URL);

/** "gbam.app": the address without https://, for showing to people. */
export const SITE_HOST = new URL(SITE_URL).host;
