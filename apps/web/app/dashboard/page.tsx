import { formatNaira, orderStatusSchema, type OrderStatus } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/order-labels";
import { StatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Orders" };

/** The filter buttons above the list. */
const FILTERS: { status: OrderStatus | undefined; label: string; href: string }[] = [
  { status: undefined, label: "All", href: "/dashboard" },
  { status: "pending", label: STATUS_LABEL.pending, href: "/dashboard?status=pending" },
  {
    status: "awaiting_payment",
    label: STATUS_LABEL.awaiting_payment,
    href: "/dashboard?status=awaiting_payment",
  },
  { status: "paid", label: STATUS_LABEL.paid, href: "/dashboard?status=paid" },
  { status: "fulfilled", label: STATUS_LABEL.fulfilled, href: "/dashboard?status=fulfilled" },
];

/**
 * /dashboard: the seller's order list. This is a SERVER component (no "use client"),
 * so it can await the API directly and sends finished HTML to the browser.
 */
export default async function OrdersPage(props: PageProps<"/dashboard">) {
  // The ?status=... part of the URL. Only accept real statuses; ignore anything else.
  const searchParams = await props.searchParams;
  let status: OrderStatus | undefined = undefined;
  const parsedStatus = orderStatusSchema.safeParse(searchParams.status);
  if (parsedStatus.success) {
    status = parsedStatus.data;
  }

  const orders = await api.listOrders(status);

  let emptyMessage = "No orders yet.";
  if (status) {
    emptyMessage = `No orders with status "${STATUS_LABEL[status]}".`;
  }

  return (
    <main>
      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter by status">
        {FILTERS.map((filter) => (
          <Link
            key={filter.href}
            href={filter.href}
            // aria-current marks the active filter (for screen readers, and for styling).
            aria-current={filter.status === status ? "page" : undefined}
            className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 text-sm aria-[current=page]:border-zinc-900 aria-[current=page]:bg-zinc-900 aria-[current=page]:text-white"
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {orders.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500">
          {emptyMessage}
        </p>
      )}

      {orders.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/dashboard/orders/${order.id}`}
                className="flex items-center gap-4 p-4 hover:bg-zinc-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-semibold">{order.code}</p>
                  <p className="truncate text-sm text-zinc-500">
                    {order.customerName} · {timeAgo(order.createdAt)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-semibold tabular-nums">{formatNaira(order.totalKobo)}</span>
                  <StatusBadge status={order.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/** "just now", "5m ago", "3h ago", or a date like "2 Oct". */
function timeAgo(isoDate: string): string {
  const millisecondsAgo = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.round(millisecondsAgo / 60_000);

  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (minutes < 60 * 24) {
    const hours = Math.round(minutes / 60);
    return `${hours}h ago`;
  }
  return new Date(isoDate).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}
