import "server-only";
import type { OrderStatus } from "@gbam/shared";

/**
 * Server-side API client. The browser never calls the API directly: pages and server
 * actions call it from the Next server, so the API needs no CORS and the seller
 * credential never reaches the client.
 */
const API_URL = process.env.API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(
      typeof body === "object" && body && "message" in body
        ? String((body as { message: unknown }).message)
        : `API request failed with ${status}`,
    );
  }
}

async function request<T>(path: string, init: RequestInit & { seller?: boolean } = {}) {
  const { seller, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body) headers.set("content-type", "application/json");
  if (seller) headers.set("x-seller-id", currentSellerId());

  const res = await fetch(`${API_URL}${path}`, { ...rest, headers, cache: "no-store" });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

/**
 * PLACEHOLDER until seller login exists: the dashboard acts as DEV_SELLER_ID.
 * Mirrors the API's dev-only guard, which rejects every request in production.
 */
function currentSellerId(): string {
  const id = process.env.DEV_SELLER_ID;
  if (!id)
    throw new Error("DEV_SELLER_ID is not set. Run `pnpm db:seed` and copy the id into .env");
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
};

export const api = {
  storefront: (slug: string) => request<Storefront>(`/storefront/${encodeURIComponent(slug)}`),

  placeOrder: (slug: string, body: unknown) =>
    request<Order>(`/storefront/${encodeURIComponent(slug)}/orders`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listOrders: (status?: OrderStatus) =>
    request<OrderListItem[]>(`/orders${status ? `?status=${status}` : ""}`, { seller: true }),

  getOrder: (id: string) => request<OrderDetail>(`/orders/${id}`, { seller: true }),

  updateOrderStatus: (id: string, status: OrderStatus) =>
    request<Order>(`/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
      seller: true,
    }),
};
