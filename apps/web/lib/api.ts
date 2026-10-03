// "server-only" makes the build fail if a browser component ever imports this file.
import "server-only";
import type { OrderStatus } from "@gbam/shared";

/**
 * The web app's ONLY way of talking to the API. It runs on the Next.js server, never in
 * the browser, so the API needs no CORS and the seller's id never reaches the browser.
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
  /** true = send the seller's id (dashboard routes). */
  seller?: boolean;
};

/** `<T>` is the shape of the JSON we expect back, e.g. request<Order>(...). */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers();
  if (options.body) {
    headers.set("content-type", "application/json");
  }
  if (options.seller) {
    headers.set("x-seller-id", currentSellerId());
  }

  const res = await fetch(`${apiUrl()}${path}`, {
    method: options.method,
    body: options.body,
    headers,
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

  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body as T;
}

/**
 * PLACEHOLDER until seller login exists: the dashboard acts as DEV_SELLER_ID.
 * Mirrors the API's dev-only guard, which rejects every request in production.
 */
function currentSellerId(): string {
  const id = process.env.DEV_SELLER_ID;
  if (!id) {
    throw new Error("DEV_SELLER_ID is not set. Run `pnpm db:seed` and copy the id into .env");
  }
  return id;
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
  return request<OrderListItem[]>(path, { seller: true });
}

async function getOrder(id: string) {
  return request<OrderDetail>(`/orders/${id}`, { seller: true });
}

async function updateOrderStatus(id: string, status: OrderStatus) {
  return request<Order>(`/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
    seller: true,
  });
}

/** Usage: `await api.getOrder(id)` */
export const api = { storefront, placeOrder, listOrders, getOrder, updateOrderStatus };
