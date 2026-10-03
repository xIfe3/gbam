import { formatNaira, nextStatuses } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/order-labels";
import { StatusBadge } from "../../status-badge";
import { MoneyBreakdown } from "./money-breakdown";
import { StatusActions } from "./status-actions";
import { WhatsAppMessages } from "./whatsapp-messages";

async function loadOrder(id: string) {
  try {
    return await api.getOrder(id);
  } catch (error) {
    // 400 = not a UUID, 404 = not this seller's order. Both look the same to the user.
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}

export async function generateMetadata(
  props: PageProps<"/dashboard/orders/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const order = await loadOrder(id);
  return { title: order.code };
}

export default async function OrderPage(props: PageProps<"/dashboard/orders/[id]">) {
  const { id } = await props.params;
  const order = await loadOrder(id);
  const waLink = `https://wa.me/${order.customer.phone}?text=${encodeURIComponent(
    `Hi ${order.customer.name}, about your order ${order.code}`,
  )}`;

  return (
    <main className="space-y-6">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← All orders
      </Link>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-mono text-2xl font-bold">{order.code}</h1>
            <p className="text-sm text-zinc-500">
              {new Date(order.createdAt).toLocaleString("en-NG", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
          <StatusBadge status={order.status} />
        </div>
        {/* Same state machine the API enforces, so buttons and API can never disagree. */}
        <StatusActions orderId={order.id} allowed={nextStatuses(order.status, "seller")} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-2 font-semibold">Customer</h2>
        <p>{order.customer.name}</p>
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          +{order.customer.phone} · Chat on WhatsApp
        </a>
        {order.note && (
          <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">{order.note}</p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-2 font-semibold">Items</h2>
        <ul className="divide-y divide-zinc-100">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between py-2">
              <span>
                {item.quantity} × {item.productName}
              </span>
              <span className="tabular-nums">
                {formatNaira(item.unitPriceKobo * item.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between border-t border-zinc-200 pt-2 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatNaira(order.totalKobo)}</span>
        </p>
      </section>

      <MoneyBreakdown payments={order.payments} />

      <WhatsAppMessages messages={order.whatsappMessages} />

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-2 font-semibold">History</h2>
        <ol className="space-y-1 text-sm">
          {order.events.map((event) => (
            <li key={event.id} className="flex justify-between gap-4">
              <span>
                {/* The very first event has no "from" (the order was just created). */}
                {event.fromStatus && <>{STATUS_LABEL[event.fromStatus]} → </>}
                <strong>{STATUS_LABEL[event.toStatus]}</strong>
                <span className="text-zinc-400"> · {event.actor}</span>
              </span>
              <time className="text-zinc-500" dateTime={event.createdAt}>
                {new Date(event.createdAt).toLocaleTimeString("en-NG", { timeStyle: "short" })}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
