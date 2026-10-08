// Plain constants (no "server-only") so both proxy.ts and lib/admin-session.ts use them.

/**
 * The admin area's sign-in cookie. Separate from the seller cookie (gbam_session), so a
 * seller can never reach admin pages and the two sign-ins never mix. Listed in the
 * Cookie Policy.
 */
export const ADMIN_COOKIE = "gbam_admin";

/** Admin sessions end after 12 hours (the API enforces this too). */
export const ADMIN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;

export function adminCookieOptions() {
  return {
    // httpOnly: page scripts can never read it, so an XSS bug can't steal it.
    httpOnly: true,
    // Only sent over https in production.
    secure: process.env.NODE_ENV === "production",
    // lax: not sent on cross-site POSTs (CSRF defence).
    sameSite: "lax" as const,
    maxAge: ADMIN_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  };
}
