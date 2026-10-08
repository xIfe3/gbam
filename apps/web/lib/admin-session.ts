import "server-only";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, adminCookieOptions } from "./admin-session-cookie";

/** The admin's session token, or null when they aren't signed in. */
export async function getAdminToken(): Promise<string | null> {
  const jar = await cookies();
  const cookie = jar.get(ADMIN_COOKIE);
  if (!cookie || cookie.value === "") {
    return null;
  }
  return cookie.value;
}

/** Only callable from a Server Action or Route Handler. */
export async function setAdminCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, adminCookieOptions());
}

/** Only callable from a Server Action or Route Handler. */
export async function clearAdminCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}
