/**
 * The "?next=" value says where to send someone after login. It comes from the URL, so it
 * must never be able to send them to another site (an "open redirect", used in phishing).
 * Accepts only a path on this site: starts with "/", is not "//host" or "/\host", and has no
 * control characters (browsers delete tabs and newlines, so "/<TAB>/evil.com" becomes
 * "//evil.com"). Returns null for anything else.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  if (/[\u0000-\u001f\u007f\\]/.test(value)) {
    return null;
  }
  return value;
}
