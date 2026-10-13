import { cleanSignupSource, SIGNUP_SOURCE_COOKIE } from "@gbam/shared";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "./lib/admin-session-cookie";
import { maintenanceRewrites } from "./lib/maintenance-paths";
import { PATH_HEADER } from "./lib/path-header";
import { getPlatformInfo } from "./lib/platform-info";
import { SESSION_COOKIE, sessionCookieOptions } from "./lib/session-cookie";

/** Admin pages anyone may open: signing in, and accepting an invite. */
function isOpenAdminPage(pathname: string): boolean {
  return pathname === "/admin/login" || pathname.startsWith("/admin/invite/");
}

/** Seller pages that need a session cookie. */
function needsSellerSession(pathname: string): boolean {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/signup/get-paid"
  );
}

/**
 * True when the browser is only fetching a page in the background, ahead of a possible
 * click (Next does this for links on screen, like "Powered by Gbam"). That isn't a visit.
 */
function isPrefetch(request: NextRequest): boolean {
  if (request.headers.get("next-router-prefetch") !== null) {
    return true;
  }
  if (request.headers.get("purpose") === "prefetch") {
    return true;
  }
  const secPurpose = request.headers.get("sec-purpose");
  if (secPurpose !== null && secPurpose.includes("prefetch")) {
    return true;
  }
  return false;
}

/** How long a ?ref= is remembered: a seller may look around for a while before signing up. */
const SOURCE_COOKIE_DAYS = 30;

/**
 * Remembers where a visitor first came from (?ref=shop-mama-ngozi from a "Powered by Gbam"
 * link, or ?utm_source=tiktok), so their signup can record it. The first source wins: a later
 * link doesn't replace it. Only a short cleaned tag is kept, never anything personal.
 */
function rememberSource(request: NextRequest, response: NextResponse): NextResponse {
  if (request.cookies.get(SIGNUP_SOURCE_COOKIE)) {
    return response;
  }
  if (isPrefetch(request)) {
    return response;
  }
  let raw = request.nextUrl.searchParams.get("ref");
  if (raw === null) {
    raw = request.nextUrl.searchParams.get("utm_source");
  }
  const source = cleanSignupSource(raw);
  if (source === null) {
    return response;
  }
  response.cookies.set(SIGNUP_SOURCE_COOKIE, source, {
    maxAge: SOURCE_COOKIE_DAYS * 24 * 60 * 60,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}

// Next 16 calls this "proxy" (it was "middleware"). It runs before every page and:
// 1. shows the maintenance page while maintenance mode blocks the page;
// 2. sends visitors without a session cookie to the right sign-in page. Whether a cookie is
//    still VALID is the API's call; lib/api.ts and lib/admin-api.ts handle a 401 from it.
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. Maintenance mode (status cached for 10 seconds; if it can't be read, carry on).
  const info = await getPlatformInfo();
  if (info !== null && maintenanceRewrites(info.maintenance.level, pathname)) {
    // "rewrite" shows the maintenance page while the address bar keeps the visitor's URL.
    return NextResponse.rewrite(new URL("/maintenance", request.url));
  }

  // 2a. The admin area has its own cookie (gbam_admin): a seller's cookie never opens it.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (isOpenAdminPage(pathname)) {
      return NextResponse.next();
    }
    const adminToken = request.cookies.get(ADMIN_COOKIE)?.value;
    if (!adminToken) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  // Every other public page: nothing more to check, apart from noting where they came from.
  if (!needsSellerSession(pathname)) {
    return rememberSource(request, NextResponse.next());
  }

  // 2b. The seller dashboard (and sign-up step 3, so a logged-out visitor comes back to it).
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const path = pathname + request.nextUrl.search;

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

// Every page, for maintenance mode; not Next's own files (/_next/...), API routes, or files
// with an extension (images, robots.txt...).
export const config = { matcher: ["/((?!_next/|api/|.*\\..*).*)"] };
