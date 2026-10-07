"use client";

/**
 * The orders placed on THIS phone/browser, so a customer can find them again on /track
 * without remembering the code (no account needed). Kept in localStorage like the basket;
 * clearing the browser or switching phones loses it, which is why we also offer the code,
 * a copyable link and an email receipt.
 */
const STORAGE_KEY = "gbam-my-orders";
const MAX_ORDERS = 20;

export type MyOrder = {
  code: string;
  key: string;
  shopSlug: string;
  businessName: string;
  placedAt: string;
};

function isMyOrder(value: unknown): value is MyOrder {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "string" &&
    typeof record.key === "string" &&
    typeof record.shopSlug === "string" &&
    typeof record.businessName === "string" &&
    typeof record.placedAt === "string"
  );
}

/** Orders remembered on this phone, newest first. Never throws: unreadable storage = none. */
export function readMyOrders(): MyOrder[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (raw === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const orders: MyOrder[] = [];
  for (const item of parsed) {
    if (isMyOrder(item)) {
      orders.push(item);
    }
  }
  return orders;
}

/** Remember an order (moved to the top if it's already there). Silently skips if storage is blocked. */
export function rememberOrder(order: MyOrder) {
  const next: MyOrder[] = [order];
  for (const existing of readMyOrders()) {
    if (existing.key !== order.key && next.length < MAX_ORDERS) {
      next.push(existing);
    }
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked (private mode): the code, link and email still work.
  }
}
