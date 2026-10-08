import { formatNaira, orderStatusSchema, type OrderStatus } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { DeliveryBanner } from "./delivery-banner";
import { EmptyState, OrdersArt } from "@/components/brand/empty-state";
import { api } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/order-labels";
import { SITE_HOST, SITE_URL } from "@/lib/site";
import { CopyLinkButton } from "./copy-link-button";
import { AddProductLink } from "./products/add-product-link";
import { PageTour } from "./tours/page-tour";
import { StatusBadge } from "./status-badge";

export const metadata: Metadata = {
  title: "Orders",
  description: "Your Gbam orders.",
};

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

  // The seller's shop address, shown in the bar at the top so it's always one tap to copy.
  // (currentUser is cached per request, so this doesn't call the API a second time.)
  let shopSlug: string | null = null;
  const user = await api.currentUser();
  if (user.seller) {
    shopSlug = user.seller.slug;
  }

  // Shops with no delivery zones get a nudge: customers can't pay for delivery upfront yet.
  const delivery = await api.getDeliverySettings();
  const needsDeliveryZones = delivery.zones.length === 0;

  return (
    <main>
      <PageTour tour="dashboard" />
      {needsDeliveryZones && <DeliveryBanner />}
      {shopSlug !== null && (
        <section
          aria-label="Your shop link"
          data-tour="shop-link"
          className="border-brand-tint mb-5 flex flex-col gap-3 rounded-2xl border-2 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 flex-1">
            <p className="text-ink-muted text-xs font-bold tracking-wide uppercase">
              Your shop link
            </p>
            <a
              href={`${SITE_URL}/${shopSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink focus-visible:outline-brand mt-0.5 block font-bold break-all underline decoration-brand-tint decoration-2 underline-offset-4 focus-visible:outline-2"
            >
              {shopLinkText(shopSlug)}
            </a>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <CopyLinkButton url={`${SITE_URL}/${shopSlug}`} />
            <span data-tour="add-product">
              <AddProductLink>+ Add product</AddProductLink>
            </span>
          </div>
        </section>
      )}
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

      {orders.length === 0 && status === undefined && shopSlug !== null && (
        <div data-tour="orders">
          <EmptyState
            art={<OrdersArt />}
            title="No orders yet"
            description="Copy your shop link above and share it on WhatsApp or your Status to get your first order."
          />
        </div>
      )}

      {orders.length === 0 && (status !== undefined || shopSlug === null) && (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500">
          {emptyMessage}
        </p>
      )}

      {orders.length > 0 && (
        <ul
          data-tour="orders"
          className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white"
        >
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
                  {order.openIssues > 0 && (
                    <span className="bg-coral-wash text-coral-deep border-coral-tint rounded-full border px-2 py-0.5 text-xs font-bold">
                      Problem reported
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/** "gbam.app/mama-ngozi": the shop address without "https://", easier to read. */
function shopLinkText(slug: string): string {
  return `${SITE_HOST}/${slug}`;
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
