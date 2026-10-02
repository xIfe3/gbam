import { formatNaira, orderStatusSchema, type OrderStatus } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/order-labels";
import { StatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Orders" };

const FILTERS: (OrderStatus | undefined)[] = [
  undefined,
  "pending",
  "awaiting_payment",
  "paid",
  "fulfilled",
];

export default async function OrdersPage(props: PageProps<"/dashboard">) {
  const { status: raw } = await props.searchParams;
  const status = orderStatusSchema.safeParse(raw).data;
  const orders = await api.listOrders(status);

  return (
    <main>
      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter by status">
        {FILTERS.map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/dashboard?status=${s}` : "/dashboard"}
            aria-current={s === status ? "page" : undefined}
            className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 text-sm aria-[current=page]:border-zinc-900 aria-[current=page]:bg-zinc-900 aria-[current=page]:text-white"
          >
            {s ? STATUS_LABEL[s] : "All"}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500">
          No orders{status ? ` with status "${STATUS_LABEL[status]}"` : " yet"}.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/dashboard/orders/${o.id}`}
                className="flex items-center gap-4 p-4 hover:bg-zinc-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-semibold">{o.code}</p>
                  <p className="truncate text-sm text-zinc-500">
                    {o.customerName} · {timeAgo(o.createdAt)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-semibold tabular-nums">{formatNaira(o.totalKobo)}</span>
                  <StatusBadge status={o.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}
