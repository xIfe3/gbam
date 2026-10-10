import { formatNaira, nextStatuses, type OrderStatus } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { OrderTotals } from "@/components/orders/order-totals";
import { DeliveryBox } from "./delivery-box";
import { notFound } from "next/navigation";
import { FormError } from "@/components/brand/form-bits";
import { api, ApiError } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/order-labels";
import { StatusBadge } from "../../status-badge";
import { MoneyBreakdown } from "./money-breakdown";
import { CustomerProblems } from "./customer-problems";
import { PaymentRequestTools } from "./payment-request-tools";
import { StatusActions } from "./status-actions";
import { CancelOrder } from "./cancel-order";
import { RefundOrder } from "./refund-order";
import { PageTour } from "../../tours/page-tour";
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
  return { title: order.code, description: `Details for order ${order.code}.` };
}

export default async function OrderPage(props: PageProps<"/dashboard/orders/[id]">) {
  const { id } = await props.params;
  const order = await loadOrder(id);
  // "Request payment" needs a payout account (Paystack subaccount) to send the money to.
  const user = await api.currentUser();
  let canRequestPayment = false;
  if (user.seller) {
    canRequestPayment = user.seller.hasPayoutAccount;
  }
  // Cancel and refund live in their own area at the bottom, away from the everyday buttons.
  const allowed = nextStatuses(order.status, "seller");
  const everydayActions: OrderStatus[] = [];
  for (const status of allowed) {
    if (status !== "cancelled" && status !== "refunded") {
      everydayActions.push(status);
    }
  }
  const canCancel = allowed.includes("cancelled");
  // A refund needs money that actually came in (the API checks this too).
  let successfulPayment: (typeof order.payments)[number] | undefined = undefined;
  for (const payment of order.payments) {
    if (payment.status === "success") {
      successfulPayment = payment;
      break;
    }
  }
  const canRefund = allowed.includes("refunded") && successfulPayment !== undefined;

  const waLink = `https://wa.me/${order.customer.phone}?text=${encodeURIComponent(
    `Hi ${order.customer.name}, about your order ${order.code}`,
  )}`;

  return (
    <main className="space-y-6">
      <PageTour tour="order" />
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
          <div data-tour="order-status">
            <StatusBadge status={order.status} />
          </div>
        </div>
        {/* Same state machine the API enforces, so buttons and API can never disagree. */}
        <div data-tour="order-actions">
          <StatusActions
            orderId={order.id}
            allowed={everydayActions}
            closed={everydayActions.length === 0 && !canCancel && !canRefund}
            canRequestPayment={canRequestPayment}
          />
        </div>
        {order.payLink && (
          <div className="mt-4 border-t border-zinc-100 pt-4">
            <PaymentRequestTools orderId={order.id} payLink={order.payLink} />
          </div>
        )}
      </section>

      <CustomerProblems orderId={order.id} issues={order.issues} />

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-2 font-semibold">Customer</h2>
        <p>{order.customer.name}</p>
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-brand-hover hover:underline"
        >
          +{order.customer.phone} · Chat on WhatsApp
        </a>
        {order.note && (
          <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">{order.note}</p>
        )}
      </section>

      <DeliveryBox order={order} />

      {order.stockShortfall && <FormError message="Stock ran out: refund needed" />}

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-2 font-semibold">Items</h2>
        <ul className="divide-y divide-zinc-100">
          {order.items.map((item) => {
            // Products without options have an empty variant title: show the name alone.
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

      <MoneyBreakdown payments={order.payments} />

      <WhatsAppMessages messages={order.whatsappMessages} />

      {(canCancel || canRefund) && (
        <section
          aria-label="Cancel or refund"
          className="space-y-6 rounded-xl border border-rose-200 bg-white p-5"
        >
          {canRefund && successfulPayment && (
            <RefundOrder
              orderId={order.id}
              reference={successfulPayment.reference}
              amountKobo={successfulPayment.amountKobo}
            />
          )}
          {canCancel && <CancelOrder orderId={order.id} code={order.code} />}
        </section>
      )}

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
