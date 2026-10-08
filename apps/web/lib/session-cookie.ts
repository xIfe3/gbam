// Plain constants (no "server-only") so both proxy.ts and lib/session.ts use the same values.

/**
 * The seller session cookie. Its name is published in the Cookie Policy: together with the
 * staff-only gbam_admin (lib/admin-session-cookie.ts) these must stay the ONLY cookies this
 * site sets. The value is the raw session token: the API stores only its hash.
 */
export const SESSION_COOKIE = "gbam_session";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Attributes for the session cookie, used when first set and when the proxy renews it. */
export function sessionCookieOptions() {
  return {
    // httpOnly: page scripts can never read the token, so an XSS bug cannot steal it.
    httpOnly: true,
    // Secure: only sent over https. Off in dev so http://localhost works.
    secure: process.env.NODE_ENV === "production",
    // lax: sent when the visitor follows a link to us, not on cross-site POSTs (CSRF defence).
    sameSite: "lax" as const,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  };
}
