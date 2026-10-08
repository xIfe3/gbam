import { formatNaira } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { DeliveryBox } from "@/app/dashboard/orders/[id]/delivery-box";
import { shortTime } from "@/components/admin/list-bits";
import { OrderTotals } from "@/components/orders/order-totals";
import { adminApi, type AdminOrderDetail } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";

export const metadata: Metadata = { title: "Order · Admin" };

const sectionClass = "rounded-xl border border-zinc-200 bg-white p-5";

async function loadOrder(id: string): Promise<AdminOrderDetail> {
  try {
    return await adminApi.order(id);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }
}

/** One order from any shop: read only (sellers manage their own orders). */
export default async function AdminOrderPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { order, shop } = await loadOrder(id);

  return (
    <div className="space-y-5">
      <Link href="/admin/orders" className="text-sm underline">
        ← Orders
      </Link>
      <h1 className="font-display text-ink text-3xl font-black">{order.code}</h1>
      <p className="text-sm">
        <Link href={`/admin/shops/${shop.id}`} className="font-bold underline">
          {shop.businessName}
        </Link>{" "}
        · {order.status} · placed {shortTime(order.createdAt)}
      </p>

      <section className={sectionClass}>
        <h2 className="mb-2 font-semibold">Customer</h2>
        <p>{order.customer.name}</p>
        <p className="text-sm text-zinc-600">+{order.customer.phone}</p>
        {order.note && <p className="mt-2 rounded-lg bg-zinc-50 p-3 text-sm">{order.note}</p>}
      </section>

      <DeliveryBox order={order} />

      <section className={sectionClass}>
        <h2 className="mb-2 font-semibold">Items</h2>
        <ul className="divide-y divide-zinc-100">
          {order.items.map((item) => {
            let label = item.productName;
            if (item.variantTitle !== "") {
              label = `${item.productName} – ${item.variantTitle}`;
            }
            return (
              <li key={item.id} className="flex justify-between gap-4 py-2">
                <span>
                  {item.quantity} × {label}
                </span>
                <span className="tabular-nums">
                  {formatNaira(item.unitPriceKobo * item.quantity)}
                </span>
              </li>
            );
          })}
        </ul>
        <OrderTotals
          subtotalKobo={order.subtotalKobo}
          deliveryFeeKobo={order.deliveryFeeKobo}
          deliveryLabel={order.deliveryZoneName}
          totalKobo={order.totalKobo}
          totalClassName="mt-2 flex justify-between border-t border-zinc-200 pt-2 font-semibold"
        />
      </section>

      <section className={sectionClass}>
        <h2 className="mb-2 font-semibold">Payments</h2>
        {order.payments.length === 0 && <p className="text-sm">No payment yet.</p>}
        <ul className="space-y-1 text-sm">
          {order.payments.map((payment) => (
            <li key={payment.id}>
              {payment.status} · {formatNaira(payment.amountKobo)} · Gbam fee{" "}
              {formatNaira(payment.platformFeeKobo)} · ref <code>{payment.reference}</code> ·{" "}
              {shortTime(payment.createdAt)}
            </li>
          ))}
        </ul>
      </section>

      {order.issues.length > 0 && (
        <section className={sectionClass}>
          <h2 className="mb-2 font-semibold">Problems the customer reported</h2>
          <ul className="space-y-2 text-sm">
            {order.issues.map((issue) => (
              <li key={issue.id}>
                {issue.reason} · {shortTime(issue.createdAt)}
                {issue.resolvedAt && " · resolved"}
                {issue.note && <span className="block text-zinc-600">{issue.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={sectionClass}>
        <h2 className="mb-2 font-semibold">WhatsApp messages</h2>
        {order.whatsappMessages.length === 0 && <p className="text-sm">None sent.</p>}
        <ul className="space-y-1 text-sm">
          {order.whatsappMessages.map((message) => (
            <li key={message.id}>
              {message.template} · {message.status}
              {message.errorMessage && ` · ${message.errorMessage}`} ·{" "}
              {shortTime(message.createdAt)}
            </li>
          ))}
        </ul>
      </section>

      <section className={sectionClass}>
        <h2 className="mb-2 font-semibold">History</h2>
        <ol className="space-y-1 text-sm">
          {order.events.map((event) => (
            <li key={event.id}>
              {event.fromStatus && `${event.fromStatus} → `}
              <strong>{event.toStatus}</strong> · {event.actor} · {shortTime(event.createdAt)}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
