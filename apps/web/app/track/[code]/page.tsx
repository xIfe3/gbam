import { formatNaira, ISSUE_REASON_LABEL, type OrderStatus } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ShopHeader } from "@/app/[slug]/shop-header";
import { api, ApiError, type TrackedOrder } from "@/lib/api";
import { PayNowButton } from "./pay-now-button";
import { ReportIssueForm } from "./report-issue-form";

// Private page: keep it out of search results.
// no-referrer: the private key in this page's address is never passed to other sites.
export const metadata: Metadata = {
  title: "Track your order",
  robots: { index: false },
  referrer: "no-referrer",
};

/** The normal path an order takes, in order, with the words the customer sees. */
const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "pending", label: "Order received" },
  { status: "awaiting_payment", label: "Waiting for payment" },
  { status: "paid", label: "Paid" },
  { status: "fulfilled", label: "Sent out" },
  { status: "delivered", label: "Delivered" },
];

function formatWhen(iso: string): string {
  // Lagos time, whatever timezone the server runs in.
  return new Date(iso).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  });
}

/** When the order reached each status (the latest time, if it happened more than once). */
function reachedAt(tracked: TrackedOrder): Map<OrderStatus, string> {
  const when = new Map<OrderStatus, string>();
  for (const event of tracked.order.events) {
    when.set(event.toStatus, event.createdAt);
  }
  return when;
}

/** /track/GB-7K3Q?k=…: a customer's own order, opened with the secret key from their link. */
export default async function TrackOrderPage(props: PageProps<"/track/[code]">) {
  const { code } = await props.params;
  const searchParams = await props.searchParams;
  const key = searchParams.k;
  if (typeof key !== "string" || key === "") {
    // No key: send them to the form, which needs the code + phone digits instead.
    redirect("/track");
  }

  let tracked: TrackedOrder;
  try {
    tracked = await api.trackView(code, key);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const { shop, order } = tracked;
  const when = reachedAt(tracked);
  const stopped = order.status === "cancelled" || order.status === "refunded";
  // e.g. "This order was cancelled on 4 Oct 2026, 14:05."
  let stoppedText = "";
  if (stopped) {
    let word = "cancelled";
    if (order.status === "refunded") {
      word = "refunded";
    }
    stoppedText = `This order was ${word}`;
    const stoppedAt = when.get(order.status);
    if (stoppedAt) {
      stoppedText = `${stoppedText} on ${formatWhen(stoppedAt)}`;
    }
    stoppedText = `${stoppedText}. Message the seller if you have questions.`;
  }
  const whatsappText = encodeURIComponent(`Hi ${shop.businessName}, about my order ${order.code}`);

  return (
    <>
      <ShopHeader shopSlug={shop.slug} businessName={shop.businessName} />
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-6 pb-16">
        <div>
          <p className="text-ink-muted text-sm">Your order</p>
          <h1 className="font-display text-ink text-4xl font-black tracking-wider">{order.code}</h1>
          <p className="text-ink-muted mt-1 text-sm">Placed {formatWhen(order.createdAt)}</p>
        </div>

        <section
          aria-labelledby="progress-heading"
          className="border-brand-tint rounded-2xl border-2 bg-white p-5"
        >
          <h2 id="progress-heading" className="text-ink mb-4 font-bold">
            Where it is now
          </h2>
          {stopped && (
            <p className="bg-coral-wash text-ink border-coral-tint mb-4 rounded-lg border px-4 py-3 text-sm font-medium">
              {stoppedText}
            </p>
          )}
          <ol className="flex flex-col gap-4">
            {STEPS.map((step) => {
              const at = when.get(step.status);
              const done = at !== undefined;
              const current = order.status === step.status;
              // aria-current="step" tells screen readers which step the order is on now.
              let ariaCurrent: "step" | undefined = undefined;
              if (current) {
                ariaCurrent = "step";
              }
              let dot = "border-brand-tint bg-white";
              if (done) {
                dot = "border-brand bg-brand";
              }
              let labelClass = "text-ink-muted";
              if (done) {
                labelClass = "text-ink font-bold";
              }
              return (
                <li key={step.status} className="flex items-start gap-3" aria-current={ariaCurrent}>
                  <span
                    aria-hidden="true"
                    className={`mt-1 size-4 shrink-0 rounded-full border-2 ${dot}`}
                  />
                  <div>
                    <p className={labelClass}>
                      {step.label}
                      {current && <span className="sr-only"> (now)</span>}
                    </p>
                    {at && <p className="text-ink-muted text-xs">{formatWhen(at)}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {tracked.canPay && (
          <PayNowButton code={order.code} trackingKey={key} totalKobo={order.totalKobo} />
        )}

        <section
          aria-labelledby="items-heading"
          className="border-brand-tint rounded-2xl border-2 bg-white p-5"
        >
          <h2 id="items-heading" className="text-ink mb-3 font-bold">
            What you ordered
          </h2>
          <ul className="divide-brand-tint flex flex-col divide-y">
            {order.items.map((item, index) => {
              let name = item.productName;
              if (item.variantTitle !== "") {
                name = `${item.productName} – ${item.variantTitle}`;
              }
              return (
                <li key={index} className="flex justify-between gap-3 py-2 text-sm">
                  <span className="text-ink">
                    {item.quantity} × {name}
                  </span>
                  <span className="text-ink tabular-nums">
                    {formatNaira(item.unitPriceKobo * item.quantity)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-ink mt-3 flex justify-between font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatNaira(order.totalKobo)}</span>
          </p>
        </section>

        <section aria-labelledby="help-heading" className="flex flex-col gap-4">
          <h2 id="help-heading" className="text-ink font-bold">
            Need help?
          </h2>
          <a
            href={`https://wa.me/${shop.whatsappPhone}?text=${whatsappText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="border-brand text-brand hover:bg-brand-tint focus-visible:outline-brand inline-flex min-h-11 w-fit items-center rounded-full border-2 bg-white px-5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            💬 Message {shop.businessName} on WhatsApp
          </a>

          {tracked.issues.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm">
              {tracked.issues.map((issue, index) => {
                let state = "The seller has been told.";
                if (issue.resolved) {
                  state = "The seller marked this as sorted.";
                }
                return (
                  <li
                    key={index}
                    className="border-brand-tint rounded-lg border bg-white px-4 py-3"
                  >
                    <span className="text-ink font-medium">{ISSUE_REASON_LABEL[issue.reason]}</span>
                    <span className="text-ink-muted">
                      {" "}
                      · {formatWhen(issue.createdAt)} · {state}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <ReportIssueForm code={order.code} trackingKey={key} />
        </section>

        <p className="text-ink-muted text-sm">
          <Link href={`/${shop.slug}`} className="underline">
            ← Back to {shop.businessName}
          </Link>
        </p>
      </main>
    </>
  );
}
