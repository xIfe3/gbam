import { formatNaira } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { ReasonForm } from "@/components/admin/action-forms";
import { shortTime } from "@/components/admin/list-bits";
import { param } from "@/components/admin/list-params";
import { adminApi } from "@/lib/admin-api";
import { resolveRefundAction } from "../admin-actions";

export const metadata: Metadata = { title: "Refunds · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Customers who paid money Gbam can't keep (the order was cancelled, or stock ran out).
 * Refund them in the Paystack dashboard, then mark the case done here.
 */
export default async function RefundsPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  let status: "open" | "resolved" = "open";
  if (param(searchParams, "status") === "resolved") {
    status = "resolved";
  }
  const cases = await adminApi.refunds(status);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-ink text-3xl font-black">Refunds</h1>
      <nav aria-label="Refund lists" className="flex gap-4 text-sm font-bold">
        <Link
          href="/admin/refunds"
          aria-current={status === "open" ? "page" : undefined}
          className="underline"
        >
          Waiting
        </Link>
        <Link
          href="/admin/refunds?status=resolved"
          aria-current={status === "resolved" ? "page" : undefined}
          className="underline"
        >
          Done
        </Link>
      </nav>
      {status === "open" && (
        <p className="text-sm text-zinc-600">
          Refund each customer in the Paystack dashboard (search for the reference), then mark it
          done here. The order moves to Refunded.
        </p>
      )}
      {cases.length === 0 && <p className="text-zinc-500">Nothing here.</p>}
      <ul className="space-y-4">
        {cases.map((refundCase) => (
          <li key={refundCase.id} className="rounded-xl border border-zinc-200 bg-white p-5">
            <p className="font-bold">
              <Link href={`/admin/orders/${refundCase.orderId}`} className="underline">
                {refundCase.orderCode}
              </Link>{" "}
              · {refundCase.shopName} · {formatNaira(refundCase.amountKobo)}
            </p>
            <p className="text-sm text-zinc-600">{refundCase.reason}</p>
            <p className="text-sm">
              Paystack reference: <code>{refundCase.paymentReference ?? "unknown"}</code> ·{" "}
              {shortTime(refundCase.createdAt)}
            </p>
            {refundCase.resolvedAt && (
              <p className="text-sm">Done {shortTime(refundCase.resolvedAt)}</p>
            )}
            {!refundCase.resolvedAt && (
              <div className="mt-3">
                <ReasonForm
                  action={resolveRefundAction.bind(null, refundCase.id)}
                  label="Mark refunded"
                  pendingLabel="Saving…"
                  reasonLabel="Note (for the audit log)"
                  tick="The money is back with the customer"
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
