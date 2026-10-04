import "server-only";
import { cookies } from "next/headers";

/**
 * The session cookie. Its name is published in the Cookie Policy, and it must stay the ONLY
 * cookie this site sets. The value is the raw session token: the API stores only its hash.
 */
export const SESSION_COOKIE = "gbam_session";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

/** The visitor's session token, or null when they have no (or an empty) cookie. */
export async function getSessionToken(): Promise<string | null> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE);
  if (!cookie || cookie.value === "") {
    return null;
  }
  return cookie.value;
}

/** Only callable from a Server Action or Route Handler (Next forbids it while rendering). */
export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    // httpOnly: page scripts can never read the token, so an XSS bug cannot steal it.
    httpOnly: true,
    // Secure: only sent over https. Off in dev so http://localhost works.
    secure: process.env.NODE_ENV === "production",
    // lax: sent when the visitor follows a link to us, not on cross-site POSTs (CSRF defence).
    sameSite: "lax",
    maxAge: THIRTY_DAYS_SECONDS,
    path: "/",
  });
}

/** Only callable from a Server Action or Route Handler. */
export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
