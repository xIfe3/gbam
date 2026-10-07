"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { readMyOrders, type MyOrder } from "@/lib/my-orders";

// Nothing to listen to: the list only changes when an order is placed on another page.
function subscribe() {
  return () => {};
}

// The list as text, so React can tell when it really changed (same text = same list).
function snapshot(): string {
  return JSON.stringify(readMyOrders());
}

// On the server there is no localStorage: an empty list, so nothing flashes.
function serverSnapshot(): string {
  return "[]";
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

/** "Your orders on this phone": one tap opens an order, nothing to remember or type. */
export function MyOrdersList() {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const orders = JSON.parse(raw) as MyOrder[];
  if (orders.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="mine-heading" className="flex flex-col gap-3">
      <h2 id="mine-heading" className="text-ink font-bold">
        Your orders on this phone
      </h2>
      <ul className="border-brand-tint divide-brand-tint divide-y-2 rounded-2xl border-2 bg-white">
        {orders.map((order) => (
          <li key={order.key}>
            <Link
              href={`/track/${order.code}?k=${encodeURIComponent(order.key)}`}
              className="hover:bg-blush focus-visible:outline-brand flex min-h-14 items-center justify-between gap-3 px-4 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <span>
                <span className="text-ink block font-bold tracking-wide">{order.code}</span>
                <span className="text-ink-muted text-sm">
                  {order.businessName} · {formatDay(order.placedAt)}
                </span>
              </span>
              <span aria-hidden="true" className="text-brand font-bold">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
