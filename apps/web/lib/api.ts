// "server-only" makes the build fail if a browser component ever imports this file.
import "server-only";
import type { OrderStatus, TicketStatus } from "@gbam/shared";
import { headers } from "next/headers";
import { cache } from "react";
import { redirect, unstable_rethrow } from "next/navigation";
import { pickVisitorIp, trustedProxyHops } from "./client-ip";
import { PATH_HEADER } from "./path-header";
import { safeNextPath } from "./safe-next";
import { clearSessionCookie, getSessionToken } from "./session";

/**
 * The web app's ONLY way of talking to the API. It runs on the Next.js server, never in
 * the browser, so the API needs no CORS and the session token never reaches page scripts.
 */
export function apiUrl(): string {
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
  /** A JSON string, or FormData for file uploads. */
  body?: string | FormData;
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
 * See lib/client-ip.ts for which header entry we trust and why.
 * Returns undefined when the headers don't tell us (e.g. local dev without a proxy).
 */
export async function visitorIp(): Promise<string | undefined> {
  // Outside the try below on purpose: a bad TRUSTED_PROXY_HOPS should fail loudly.
  const hops = trustedProxyHops(process.env.TRUSTED_PROXY_HOPS);
  try {
    const incoming = await headers();
    return pickVisitorIp({
      forwardedFor: incoming.get("x-forwarded-for"),
      hops,
    });
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
  // For FormData we set NO content-type: fetch adds "multipart/form-data" together with the
  // boundary text that separates the fields. Setting it by hand would leave the boundary out.
  if (typeof options.body === "string") {
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

  // 204 means "done, nothing to send back", so there is no JSON to read.
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

/** One product card on the shop grid. */
export type StorefrontProductCard = {
  slug: string;
  name: string;
  photoUrl: string | null;
  minPriceKobo: number;
  maxPriceKobo: number;
  soldOut: boolean;
};

export type Storefront = {
  store: {
    slug: string;
    businessName: string;
    /** Checkout shows these zones; an empty list means "address only, no delivery fee". */
    delivery: DeliverySettings;
    /** Gbam paused the shop: no products are listed and nothing can be ordered. */
    suspended?: boolean;
  };
  products: StorefrontProductCard[];
};

export type StorefrontVariant = {
  id: string;
  /** Aligned with the product options order; [] for a product with no options. */
  optionValues: string[];
  title: string;
  priceKobo: number;
  /** null = the seller does not track stock for this variant. */
  stock: number | null;
  imageId: string | null;
};

export type StorefrontProduct = {
  slug: string;
  name: string;
  description: string | null;
  /** In display order; the first is the main photo. */
  images: { id: string; largeUrl: string; smallUrl: string }[];
  options: { name: string; values: string[] }[];
  variants: StorefrontVariant[];
};

export type StorefrontProductPage = {
  store: { slug: string; businessName: string };
  product: StorefrontProduct;
};

export type Order = {
  id: string;
  code: string;
  status: OrderStatus;
  totalKobo: number;
  note: string | null;
  createdAt: string;
};

/**
 * Delivery details on a seller's order. Optional because orders placed before delivery
 * existed (and some test data) don't have them.
 */
export type OrderDelivery = {
  subtotalKobo?: number;
  deliveryFeeKobo?: number;
  deliveryZoneName?: string | null;
  deliveryIsPickup?: boolean;
  deliveryAddress?: string | null;
  deliveryLandmark?: string | null;
};

/** What placing an order returns: the order plus its secret tracking key. */
export type PlacedOrder = Order & { trackingKey: string };

export type OrderListItem = Pick<Order, "id" | "code" | "status" | "totalKobo" | "createdAt"> & {
  /** Problems the customer reported that the seller hasn't marked resolved. */
  openIssues: number;
  customerName: string;
  customerPhone: string;
};

export type OrderDetail = Order & {
  customer: { name: string; phone: string };
  /** Problems the customer reported from their tracking page, newest first. */
  issues: {
    id: string;
    reason: "paid_not_marked" | "not_received" | "wrong_or_damaged" | "other";
    note: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }[];
  items: {
    id: string;
    productName: string;
    /** "" for a product with no options. */
    variantTitle: string;
    unitPriceKobo: number;
    quantity: number;
  }[];
  /** True when stock ran out after the customer paid, so the seller must refund. */
  stockShortfall: boolean;
  /** While payment is due: the customer's pay link, for "Copy payment link". Else null. */
  payLink: string | null;
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
    /** Paystack's reference for this payment: what support needs to find it. */
    reference: string;
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

// ---- Seller product management ----

export type ProductStatus = "active" | "hidden";

/** One row on the seller's products list (archived products are not included). */
export type ProductListItem = {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  mainPhotoUrl: string | null;
  minPriceKobo: number;
  maxPriceKobo: number;
  variantCount: number;
  /** null = stock is not tracked. */
  totalStock: number | null;
};

export type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  /** Sent back on save so the API can spot an edit made somewhere else in between. */
  version: number;
  images: { id: string; position: number; largeUrl: string; smallUrl: string }[];
  options: { name: string; values: string[] }[];
  variants: {
    id: string;
    optionValues: string[];
    title: string;
    priceKobo: number;
    stock: number | null;
    imageId: string | null;
    isEnabled: boolean;
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

async function storefrontProduct(slug: string, productSlug: string) {
  return request<StorefrontProductPage>(
    `/storefront/${encodeURIComponent(slug)}/products/${encodeURIComponent(productSlug)}`,
  );
}

async function placeOrder(slug: string, body: unknown) {
  return request<PlacedOrder>(`/storefront/${encodeURIComponent(slug)}/orders`, {
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
  // The seller's order page also gets the delivery details.
  return request<OrderDetail & OrderDelivery>(`/orders/${id}`, { auth: "session" });
}

async function updateOrderStatus(id: string, status: OrderStatus) {
  return request<Order>(`/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
    auth: "session",
  });
}

async function listProducts() {
  return request<ProductListItem[]>("/products", { auth: "session" });
}

async function getProduct(id: string) {
  return request<ProductDetail>(`/products/${encodeURIComponent(id)}`, { auth: "session" });
}

async function createProduct(body: unknown) {
  return request<ProductDetail>("/products", {
    method: "POST",
    body: JSON.stringify(body),
    auth: "session",
  });
}

/** `body` includes the `version` the form was loaded with. */
async function updateProduct(id: string, body: unknown) {
  return request<ProductDetail>(`/products/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
    auth: "session",
  });
}

async function setProductStatus(id: string, status: ProductStatus) {
  // The API answers 204 with no body.
  await request<null>(`/products/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
    auth: "session",
  });
}

async function deleteProduct(id: string) {
  return request<{ archived: boolean }>(`/products/${encodeURIComponent(id)}`, {
    method: "DELETE",
    auth: "session",
  });
}

/** `formData` holds the file in a field called "photo". */
async function uploadProductPhoto(formData: FormData) {
  return request<{ id: string; smallUrl: string }>("/products/images", {
    method: "POST",
    body: formData,
    auth: "session",
  });
}

async function deleteProductPhoto(id: string) {
  await request<null>(`/products/images/${encodeURIComponent(id)}`, {
    method: "DELETE",
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
  seller: {
    id: string;
    slug: string;
    businessName: string;
    hasPayoutAccount: boolean;
    /** Gbam paused the shop: the dashboard shows why orders stopped. Missing on older APIs. */
    suspended?: boolean;
  } | null;
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

/**
 * The logged-in user. A missing/expired session redirects to /login.
 * React's cache() remembers the answer for the rest of this one page render, so the
 * dashboard layout and the page can both ask without calling the API twice.
 */
const currentUser = cache(async function currentUser() {
  return request<PublicUser>("/auth/me", { auth: "session" });
});

/** The logged-in user, or null (no cookie, dead session, or API trouble). Never redirects. */
async function currentUserOrNull(): Promise<PublicUser | null> {
  const token = await getSessionToken();
  if (token === null) {
    return null;
  }
  try {
    return await request<PublicUser>("/auth/me", { auth: "token" });
  } catch (error) {
    unstable_rethrow(error);
    // 401 = dead session. Anything else (API down, 5xx) also means "not known to be logged
    // in": the login pages should still render rather than show an error page.
    if (!(error instanceof ApiError && error.status === 401)) {
      console.error(
        "current user lookup failed",
        error instanceof ApiError ? error.status : "error",
      );
    }
    return null;
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

// ---- Payouts (sign-up step 3) ----

export type Bank = { name: string; code: string };

export type PayoutAccountBody = { bankCode: string; accountNumber: string };

/** What the API saved. Only the last 4 digits of the account number ever come back. */
export type PayoutAccount = { bankName: string; accountLast4: string; bankAccountName: string };

async function listBanks() {
  return request<Bank[]>("/payouts/banks", { auth: "session" });
}

async function resolvePayoutAccount(body: PayoutAccountBody) {
  return request<{ accountName: string; bankName: string }>("/payouts/resolve-account", {
    method: "POST",
    body: JSON.stringify(body),
    auth: "session",
  });
}

async function createPayoutAccount(body: PayoutAccountBody) {
  return request<PayoutAccount>("/payouts/account", {
    method: "POST",
    body: JSON.stringify(body),
    auth: "session",
  });
}

/** Settings → change bank account: the same Paystack subaccount, pointed at a new account. */
async function changePayoutAccount(body: PayoutAccountBody & { currentPassword: string }) {
  return request<PayoutAccount>("/payouts/account", {
    method: "PUT",
    body: JSON.stringify(body),
    auth: "session",
  });
}

// ---- Settings ----

export type ShopSettings = {
  slug: string;
  businessName: string;
  phone: string;
  payoutAccount: PayoutAccount | null;
  /** Email the owner when a new order comes in. */
  newOrderEmails: boolean;
  /** Gbam's "news and tips" announcement emails. */
  newsEmails: boolean;
  /** When the shop link can next be changed; null = now. */
  nextSlugChangeAt: string | null;
};

async function getSettings() {
  return request<ShopSettings>("/settings", { auth: "session" });
}

/** Is this shop link free for this shop? (Its own old links are.) */
async function shopSlugAvailable(slug: string) {
  return request<{ available: boolean; reason?: "taken" | "reserved" | "invalid" }>(
    `/settings/slug-available?slug=${encodeURIComponent(slug)}`,
    { auth: "session" },
  );
}

/** A new shop link; the old one keeps redirecting to it. */
async function changeSlug(slug: string) {
  return request<{ slug: string; nextSlugChangeAt: string | null }>("/settings/slug", {
    method: "PATCH",
    body: JSON.stringify({ slug }),
    auth: "session",
  });
}

async function updateShopSettings(body: { businessName: string; phone: string }) {
  return request<ShopSettings>("/settings/shop", {
    method: "PATCH",
    body: JSON.stringify(body),
    auth: "session",
  });
}

export type DeliveryZone = { id: string; name: string; feeKobo: number; isPickup: boolean };
export type DeliverySettings = { zones: DeliveryZone[]; pickupNote: string | null };

async function getDeliverySettings() {
  return request<DeliverySettings>("/settings/delivery", { auth: "session" });
}

/** Saves the whole list of zones at once; zones left out are removed. */
async function saveDeliverySettings(body: {
  zones: { id?: string; name: string; feeKobo: number; isPickup: boolean }[];
  pickupNote: string | null;
}) {
  return request<DeliverySettings>("/settings/delivery", {
    method: "PUT",
    body: JSON.stringify(body),
    auth: "session",
  });
}

async function updateEmailSettings(body: { newOrderEmails: boolean; newsEmails?: boolean }) {
  return request<ShopSettings>("/settings/emails", {
    method: "PATCH",
    body: JSON.stringify(body),
    auth: "session",
  });
}

async function changePassword(body: { currentPassword: string; newPassword: string }) {
  return request<{ ok: true }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(body),
    auth: "session",
  });
}

async function closeAccount(body: { businessName: string; password: string }) {
  return request<{ ok: true }>("/auth/close-account", {
    method: "POST",
    body: JSON.stringify(body),
    auth: "session",
  });
}

/** How far the seller got in one guided tour. outcome is null while it's unfinished. */
export type TourState = { step: number; outcome: "completed" | "skipped" | null };
export type TourStates = Partial<Record<"dashboard" | "editor" | "order", TourState>>;

/** Every tour this seller has started. Cached per render like currentUser. */
const getTours = cache(async function getTours() {
  return request<TourStates>("/tours", { auth: "session" });
});

async function saveTourStep(tour: string, step: number) {
  return request<TourState>(`/tours/${encodeURIComponent(tour)}/step`, {
    method: "PUT",
    body: JSON.stringify({ step }),
    auth: "session",
  });
}

async function finishTour(tour: string, outcome: "completed" | "skipped") {
  return request<TourState>(`/tours/${encodeURIComponent(tour)}/finish`, {
    method: "POST",
    body: JSON.stringify({ outcome }),
    auth: "session",
  });
}

export type IssueReason = "paid_not_marked" | "not_received" | "wrong_or_damaged" | "other";

/** What a customer's tracking page shows (no personal details). */
export type TrackedOrder = {
  shop: { slug: string; businessName: string; whatsappPhone: string };
  order: {
    code: string;
    status: OrderStatus;
    subtotalKobo?: number;
    deliveryFeeKobo?: number;
    totalKobo: number;
    /** No address here: only the seller sees it. null when the order has no delivery zone. */
    delivery?: { zoneName: string; isPickup: boolean; pickupNote: string | null } | null;
    createdAt: string;
    items: { productName: string; variantTitle: string; unitPriceKobo: number; quantity: number }[];
    events: { toStatus: OrderStatus; createdAt: string }[];
  };
  issues: { reason: IssueReason; createdAt: string; resolved: boolean }[];
  canPay: boolean;
};

async function trackLookup(body: { code: string; phoneLast4: string }) {
  return request<{ code: string; key: string }>("/track/lookup", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function trackPath(code: string, key: string, rest: string): string {
  return `/track/${encodeURIComponent(code)}${rest}?key=${encodeURIComponent(key)}`;
}

async function trackView(code: string, key: string) {
  return request<TrackedOrder>(trackPath(code, key, ""));
}

async function trackPay(code: string, key: string) {
  // accessCode opens Paystack's pop-up; url is Paystack's own page (the fallback).
  return request<{ url: string; accessCode: string | null }>(trackPath(code, key, "/pay"), {
    method: "POST",
  });
}

async function trackReportIssue(
  code: string,
  key: string,
  body: { reason: IssueReason; note?: string },
) {
  return request<{ ok: true }>(trackPath(code, key, "/issues"), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** "Resend payment request": the WhatsApp payment message again (at most every 10 minutes). */
async function resendPaymentRequest(orderId: string) {
  return request<{ nextAllowedAt: string }>(
    `/orders/${encodeURIComponent(orderId)}/resend-payment`,
    { method: "POST", auth: "session" },
  );
}

async function resolveOrderIssue(orderId: string, issueId: string) {
  return request<{ id: string }>(
    `/orders/${encodeURIComponent(orderId)}/issues/${encodeURIComponent(issueId)}/resolve`,
    { method: "PATCH", auth: "session" },
  );
}

/** A ticket in the seller's Help list. */
export type HelpTicketSummary = {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
};

/** A ticket as the person who asked sees it: no internal notes, replies from "Gbam support". */
export type HelpTicket = {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  messages: {
    id: string;
    author: "requester" | "admin" | "system";
    body: string;
    createdAt: string;
  }[];
};

async function helpTickets() {
  return request<HelpTicketSummary[]>("/help/tickets", { auth: "session" });
}

async function helpTicket(id: string) {
  return request<HelpTicket>(`/help/tickets/${encodeURIComponent(id)}`, { auth: "session" });
}

async function openHelpTicket(body: { subject: string; message: string; orderCode?: string }) {
  return request<{ id: string; number: number }>("/help/tickets", {
    method: "POST",
    body: JSON.stringify(body),
    auth: "session",
  });
}

async function replyHelpTicket(id: string, message: string) {
  return request<{ ok: true }>(`/help/tickets/${encodeURIComponent(id)}/reply`, {
    method: "POST",
    body: JSON.stringify({ message }),
    auth: "session",
  });
}

/** "Ask Gbam to help" on a customer's problem report. */
async function escalateOrderIssue(orderId: string, issueId: string, message: string) {
  return request<{ id: string; number: number }>(
    `/orders/${encodeURIComponent(orderId)}/issues/${encodeURIComponent(issueId)}/escalate`,
    { method: "POST", body: JSON.stringify({ message }), auth: "session" },
  );
}

/** The private ticket link from a contact-form reply email: /help/tickets/:id?k=… */
async function publicTicket(id: string, key: string) {
  return request<HelpTicket>(`/tickets/${encodeURIComponent(id)}?k=${encodeURIComponent(key)}`);
}

async function replyPublicTicket(id: string, key: string, message: string) {
  return request<{ ok: true }>(
    `/tickets/${encodeURIComponent(id)}/reply?k=${encodeURIComponent(key)}`,
    { method: "POST", body: JSON.stringify({ message }) },
  );
}

/** The bell in the dashboard: Gbam's notifications to this shop, newest first. */
export type BellData = {
  unread: number;
  items: {
    id: string;
    type: "info" | "warning" | "action";
    title: string;
    body: string;
    link: string | null;
    readAt: string | null;
    createdAt: string;
  }[];
};

async function bell() {
  return request<BellData>("/bell", { auth: "session" });
}

async function markNotificationRead(id: string) {
  return request<{ ok: true }>(`/bell/${encodeURIComponent(id)}/read`, {
    method: "POST",
    auth: "session",
  });
}

async function markAllNotificationsRead() {
  return request<{ ok: true }>("/bell/read-all", { method: "POST", auth: "session" });
}

/** The "Unsubscribe" button on /unsubscribe: turns off Gbam's news and tips emails. */
async function unsubscribe(sellerId: string, token: string) {
  return request<{ ok: true }>("/email/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ s: sellerId, t: token }),
  });
}

/** Usage: `await api.getOrder(id)` */
export const api = {
  bell,
  markNotificationRead,
  markAllNotificationsRead,
  unsubscribe,
  helpTickets,
  helpTicket,
  openHelpTicket,
  replyHelpTicket,
  escalateOrderIssue,
  publicTicket,
  replyPublicTicket,
  trackLookup,
  trackView,
  trackPay,
  trackReportIssue,
  resolveOrderIssue,
  resendPaymentRequest,
  getTours,
  saveTourStep,
  finishTour,
  listBanks,
  resolvePayoutAccount,
  createPayoutAccount,
  changePayoutAccount,
  getSettings,
  updateShopSettings,
  shopSlugAvailable,
  changeSlug,
  updateEmailSettings,
  getDeliverySettings,
  saveDeliverySettings,
  changePassword,
  closeAccount,
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
  storefrontProduct,
  placeOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  setProductStatus,
  deleteProduct,
  uploadProductPhoto,
  deleteProductPhoto,
  listContent,
  getContent,
};
