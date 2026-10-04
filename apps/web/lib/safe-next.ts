// A host that cannot exist, used only to resolve paths the way a browser would.
const BASE = "http://gbam.invalid";

/**
 * The "?next=" value says where to send someone after login. It comes from the URL, so it
 * must never be able to send them to another site (an "open redirect", used in phishing).
 * Accepts only a path on this site. Returns the normalised path, or null for anything else.
 *
 * Plain prefix checks are not enough: "/..//evil.com" starts with a single "/", but a
 * browser resolves the ".." and ends up with "//evil.com", which means https://evil.com.
 * So after the simple checks we resolve the value like a browser does (this also decodes
 * "%2e%2e") and check the RESULT.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  // Control characters: browsers delete tabs and newlines, so "/<TAB>/evil.com" becomes
  // "//evil.com". Backslashes are treated as "/" by browsers.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE || url.pathname.startsWith("//")) {
    return null;
  }
  return url.pathname + url.search + url.hash;
}
