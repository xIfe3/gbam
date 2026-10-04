import { NextResponse, type NextRequest } from "next/server";
import { PATH_HEADER } from "./lib/path-header";
import { SESSION_COOKIE, sessionCookieOptions } from "./lib/session-cookie";

// Next 16 calls this "proxy" (it was "middleware"). It is a cheap first gate: no cookie
// means no session, so go to login. Whether the cookie is still VALID is the API's call;
// lib/api.ts handles a 401 from it.
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const path = request.nextUrl.pathname + request.nextUrl.search;

  if (!token) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }

  // Overwrite (never trust) any x-gbam-path the visitor sent themselves.
  const forwarded = new Headers(request.headers);
  forwarded.set(PATH_HEADER, path);
  const response = NextResponse.next({ request: { headers: forwarded } });
  // Sliding session: every dashboard visit restarts the 30-day cookie lifetime (the API
  // slides its own expiry the same way).
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}

// Sign-up step 3 needs a session too, so a logged-out visitor comes back to it after login.
export const config = { matcher: ["/dashboard/:path*", "/signup/get-paid"] };
