import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionCookieOptions } from "./session-cookie";

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
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
}

/** Only callable from a Server Action or Route Handler. */
export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
