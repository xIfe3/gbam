// "server-only" makes the build fail if a browser component ever imports this file.
import "server-only";
import type { OrderStatus } from "@gbam/shared";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { PATH_HEADER } from "./path-header";
import { safeNextPath } from "./safe-next";
import { clearSessionCookie, getSessionToken } from "./session";

/**
 * The web app's ONLY way of talking to the API. It runs on the Next.js server, never in
 * the browser, so the API needs no CORS and the session token never reaches page scripts.
 */
function apiUrl(): string {
  const fromEnv = process.env.API_URL;
  if (fromEnv) {
    return fromEnv;
  }
  return "http://localhost:4000";
}

/** Thrown when the API answers with an error status (4xx/5xx). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(messageFromBody(body, status));
  }
}

/** Uses the API's own error message if it sent one. */
function messageFromBody(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null && "message" in body) {
    return String(body.message);
  }
  return `API request failed with ${status}`;
}

type RequestOptions = {
  method?: string;
  body?: string;
  /**
   * "none" (default): public route, no token.
   * "session": needs a logged-in user. No cookie or a 401 clears the cookie and redirects to
   *   /login; 403 EMAIL_NOT_VERIFIED redirects to /signup/verify.
   * "token": sends the token if there is one but never redirects (the caller handles errors).
   */
  auth?: "none" | "session" | "token";
};

/** The page being rendered, for "?next=". Falls back to the dashboard. */
async function currentPath(): Promise<string> {
  try {
    const incoming = await headers();
    const path = safeNextPath(incoming.get(PATH_HEADER));
    if (path !== null) {
      return path;
    }
  } catch (error) {
    unstable_rethrow(error);
  }
  return "/dashboard";
}

/** Clears the dead cookie (when allowed) and sends the visitor to log in again. */
async function redirectToLogin(): Promise<never> {
  try {
    await clearSessionCookie();
  } catch {
    // Next only allows cookie changes in Server Actions and Route Handlers. While a page
    // renders this throws; the redirect below still happens and a fresh login replaces it.
  }
  const next = await currentPath();
  redirect(`/login?next=${encodeURIComponent(next)}`);
}

/**
 * The visitor's IP, from the proxy headers on the request to the Next server. The API only
 * ever sees this server's address, so we pass the visitor's along (for rate limits).
 * Returns undefined when neither header is present (e.g. local dev without a proxy).
 */
async function visitorIp(): Promise<string | undefined> {
  try {
    const incoming = await headers();
    const forwarded = incoming.get("x-forwarded-for");
    if (forwarded) {
      // "client, proxy1, proxy2": the first entry is the original client.
      const first = (forwarded.split(",")[0] ?? "").trim();
      if (first !== "") {
        return first;
      }
    }
    const real = incoming.get("x-real-ip");
    if (real && real.trim() !== "") {
      return real.trim();
    }
  } catch (error) {
    // headers() is a Dynamic API: during prerendering it throws an internal Next.js signal
    // that must reach Next (it marks the page as dynamic). Re-throw those; anything left is
    // the plain "called outside a request" error, where there simply is no visitor.
    unstable_rethrow(error);
  }
  return undefined;
}

/** `<T>` is the shape of the JSON we expect back, e.g. request<Order>(...). */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const requestHeaders = new Headers();
  if (options.body) {
    requestHeaders.set("content-type", "application/json");
  }
  const auth = options.auth ?? "none";
  if (auth !== "none") {
    const token = await getSessionToken();
    if (token) {
      requestHeaders.set("authorization", `Bearer ${token}`);
    } else if (auth === "session") {
      return redirectToLogin();
    }
  }
  const ip = await visitorIp();
  // The API only believes x-client-ip when it comes with this shared secret, so nobody
  // else can fake a visitor IP to dodge its rate limits. Server-only: never sent to browsers.
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (ip && internalSecret) {
    requestHeaders.set("x-client-ip", ip);
    requestHeaders.set("x-internal-secret", internalSecret);
  }

  const res = await fetch(`${apiUrl()}${path}`, {
    method: options.method,
    body: options.body,
    headers: requestHeaders,
    cache: "no-store", // always fetch fresh data, never a cached copy
  });

  let body: unknown = null;
  if (res.status !== 204) {
    try {
      body = await res.json();
    } catch {
      body = null; // empty or non-JSON reply
    }
  }

  if (!res.ok && auth === "session") {
    if (res.status === 401) {
      return redirectToLogin();
    }
    if (res.status === 403 && isUnverifiedBody(body)) {
      redirect("/signup/verify");
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body as T;
}

function isUnverifiedBody(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    body.code === "EMAIL_NOT_VERIFIED"
  );
}

// ---- Response shapes (mirror the API until we share response types) ----

export type Storefront = {
  store: { slug: string; businessName: string };
  products: { id: string; name: string; description: string | null; priceKobo: number }[];
};

export type Order = {
  id: string;
  code: string;
  status: OrderStatus;
  totalKobo: number;
  note: string | null;
  createdAt: string;
};

export type OrderListItem = Pick<Order, "id" | "code" | "status" | "totalKobo" | "createdAt"> & {
  customerName: string;
  customerPhone: string;
};

export type OrderDetail = Order & {
  customer: { name: string; phone: string };
  items: { id: string; productName: string; unitPriceKobo: number; quantity: number }[];
  events: {
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    actor: string;
    createdAt: string;
  }[];
  /** Newest first. */
  payments: {
    id: string;
    status: "pending" | "success" | "failed";
    amountKobo: number;
    platformFeeKobo: number;
    paystackFeeKobo: number | null;
    createdAt: string;
  }[];
  /** Oldest first. Updated by the WhatsApp webhook. */
  whatsappMessages: {
    id: string;
    template: string;
    status: "accepted" | "sent" | "delivered" | "read" | "failed";
    errorCode: number | null;
    errorMessage: string | null;
    createdAt: string;
  }[];
};

export type ContentType = "help_article" | "faq" | "blog_post" | "changelog" | "legal";

export type ContentSummary = {
  slug: string;
  title: string;
  summary: string | null;
  category: string | null;
  sortOrder: number;
  publishedAt: string;
};

export type ContentEntryDto = ContentSummary & {
  body: string;
  data: unknown;
};

// ---- One function per API endpoint ----
// encodeURIComponent makes a value safe to put in a URL (escapes spaces, slashes, etc.).

async function storefront(slug: string) {
  return request<Storefront>(`/storefront/${encodeURIComponent(slug)}`);
}

async function placeOrder(slug: string, body: unknown) {
  return request<Order>(`/storefront/${encodeURIComponent(slug)}/orders`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function listOrders(status?: OrderStatus) {
  let path = "/orders";
  if (status) {
    path = `/orders?status=${status}`;
  }
  return request<OrderListItem[]>(path, { auth: "session" });
}

async function getOrder(id: string) {
  return request<OrderDetail>(`/orders/${id}`, { auth: "session" });
}

async function updateOrderStatus(id: string, status: OrderStatus) {
  return request<Order>(`/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
    auth: "session",
  });
}

async function listContent(type: ContentType) {
  return request<ContentSummary[]>(`/content/${type}`);
}

async function getContent(type: ContentType, slug: string) {
  return request<ContentEntryDto>(`/content/${type}/${encodeURIComponent(slug)}`);
}

async function sendContactMessage(body: unknown) {
  return request<{ received: true }>("/contact", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---- Auth ----

export type PublicUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  role: "seller" | "admin";
  seller: { id: string; slug: string; businessName: string; hasPayoutAccount: boolean } | null;
};

export type AuthResult = { sessionToken: string; user: PublicUser };

export type SignupBody = {
  businessName: string;
  slug: string;
  phone: string;
  email: string;
  password: string;
};

export type SlugAvailability = { available: boolean; reason?: "taken" | "reserved" | "invalid" };

async function signup(body: SignupBody) {
  return request<AuthResult>("/auth/signup", { method: "POST", body: JSON.stringify(body) });
}

async function slugAvailable(slug: string) {
  return request<SlugAvailability>(`/auth/slug-available?slug=${encodeURIComponent(slug)}`);
}

async function verifyEmail(code: string) {
  return request<{ ok: true }>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ code }),
    auth: "session",
  });
}

async function resendCode() {
  return request<{ ok: true }>("/auth/resend-code", { method: "POST", auth: "session" });
}

async function login(body: { email: string; password: string }) {
  return request<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify(body) });
}

async function logout() {
  return request<{ ok: true }>("/auth/logout", { method: "POST", auth: "token" });
}

/** The logged-in user. A missing/expired session redirects to /login. */
async function currentUser() {
  return request<PublicUser>("/auth/me", { auth: "session" });
}

/** The logged-in user, or null (no cookie, or the API says the session is dead). Never redirects. */
async function currentUserOrNull(): Promise<PublicUser | null> {
  const token = await getSessionToken();
  if (token === null) {
    return null;
  }
  try {
    return await request<PublicUser>("/auth/me", { auth: "token" });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

async function forgotPassword(email: string) {
  return request<{ ok: true; message: string; requestId: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

async function resetPassword(body: {
  email: string;
  requestId: string;
  code: string;
  password: string;
}) {
  return request<AuthResult>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Usage: `await api.getOrder(id)` */
export const api = {
  signup,
  slugAvailable,
  verifyEmail,
  resendCode,
  login,
  logout,
  currentUser,
  currentUserOrNull,
  forgotPassword,
  resetPassword,
  sendContactMessage,
  storefront,
  placeOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
  listContent,
  getContent,
};
