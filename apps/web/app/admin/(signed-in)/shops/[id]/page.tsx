import { formatNaira } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { ActionButton, DateForm, ReasonForm } from "@/components/admin/action-forms";
import { adminCan } from "@/components/admin/admin-nav";
import { shortTime } from "@/components/admin/list-bits";
import { adminApi, type AdminShopDetail } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import {
  feeWaiverAction,
  reopenShopAction,
  resendVerificationAction,
  suspendShopAction,
  unlockSellerAction,
} from "../../admin-actions";

export const metadata: Metadata = { title: "Shop · Admin" };

const sectionClass = "rounded-xl border border-zinc-200 bg-white p-5";

/** "2027-01-06": the date this many days from today, for a date box. */
function daysFromToday(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function loadShop(id: string): Promise<AdminShopDetail> {
  try {
    return await adminApi.shop(id);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }
}

export default async function ShopDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const me = await adminApi.me();
  const detail = await loadShop(id);
  const shop = detail.shop;

  let statusText = "Active";
  if (shop.status === "suspended") {
    statusText = `Suspended ${shortTime(shop.suspendedAt)}: ${shop.suspendedReason ?? ""}`;
  } else if (shop.status === "closed") {
    statusText = `Deleted by the owner ${shortTime(shop.closedAt)}`;
  }

  let waiverText = "Normal fees.";
  if (shop.feeWaivedUntil) {
    waiverText = `No Gbam fee until ${shortTime(shop.feeWaivedUntil)}.`;
  }
  let waiverDate: string | null = null;
  if (shop.feeWaivedUntil) {
    waiverDate = shop.feeWaivedUntil.slice(0, 10);
  }
  // A new waiver starts with "today + the founding-seller length" from Admin → Settings
  // (90 days if this admin can't read the settings).
  let waiverDays = 90;
  if (adminCan(me, "settings.manage")) {
    const { settings } = await adminApi.settings();
    waiverDays = settings.foundingWaiverDays;
  }
  const suggestedWaiver = daysFromToday(waiverDays);

  return (
    <div className="space-y-5">
      <Link href="/admin/shops" className="text-sm underline">
        ← Shops
      </Link>
      <h1 className="font-display text-ink text-3xl font-black">{shop.businessName}</h1>

      <section className={sectionClass}>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <dt className="text-zinc-500">Link</dt>
          <dd>/{shop.slug}</dd>
          <dt className="text-zinc-500">WhatsApp</dt>
          <dd>+{shop.whatsappPhone}</dd>
          <dt className="text-zinc-500">Status</dt>
          <dd>{statusText}</dd>
          <dt className="text-zinc-500">Products</dt>
          <dd>{shop.productCount}</dd>
          <dt className="text-zinc-500">Joined</dt>
          <dd>{shortTime(shop.createdAt)}</dd>
          <dt className="text-zinc-500">Fees</dt>
          <dd>{waiverText}</dd>
        </dl>
      </section>

      <section aria-labelledby="owner-heading" className={sectionClass}>
        <h2 id="owner-heading" className="mb-2 font-semibold">
          Owner
        </h2>
        {detail.owner === null && <p className="text-sm">No owner account.</p>}
        {detail.owner !== null && (
          <div className="space-y-1 text-sm">
            <p>{detail.owner.email}</p>
            <p>Email verified: {detail.owner.emailVerified ? "yes" : "no"}</p>
            {detail.owner.lockedUntil && (
              <p>
                Locked out until {shortTime(detail.owner.lockedUntil)} (too many wrong passwords)
              </p>
            )}
          </div>
        )}
        {detail.owner !== null && adminCan(me, "sellers.help") && (
          <div className="mt-3 flex flex-wrap gap-3">
            <ActionButton action={unlockSellerAction.bind(null, shop.id)} label="Unlock seller" />
            {!detail.owner.emailVerified && (
              <ActionButton
                action={resendVerificationAction.bind(null, shop.id)}
                label="Resend verification"
              />
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="payout-heading" className={sectionClass}>
        <h2 id="payout-heading" className="mb-2 font-semibold">
          Payout account
        </h2>
        {detail.payoutAccount === null && <p className="text-sm">None yet.</p>}
        {detail.payoutAccount !== null && (
          <p className="text-sm">
            {detail.payoutAccount.bankAccountName}, {detail.payoutAccount.bankName}, ending{" "}
            {detail.payoutAccount.accountLast4}
          </p>
        )}
      </section>

      <section aria-labelledby="orders-heading" className={sectionClass}>
        <h2 id="orders-heading" className="mb-2 font-semibold">
          Recent orders
        </h2>
        {detail.recentOrders.length === 0 && <p className="text-sm">No orders yet.</p>}
        <ul className="divide-y divide-zinc-100 text-sm">
          {detail.recentOrders.map((order) => (
            <li key={order.id} className="flex justify-between gap-3 py-2">
              <Link href={`/admin/orders/${order.id}`} className="font-bold underline">
                {order.code}
              </Link>
              <span>{order.status}</span>
              <span className="tabular-nums">{formatNaira(order.totalKobo)}</span>
            </li>
          ))}
        </ul>
      </section>

      {adminCan(me, "fees.manage") && (
        <section aria-labelledby="fees-heading" className={sectionClass}>
          <h2 id="fees-heading" className="mb-2 font-semibold">
            Fee waiver
          </h2>
          <DateForm
            action={feeWaiverAction.bind(null, shop.id)}
            label="No Gbam fee until"
            current={waiverDate}
            suggested={suggestedWaiver}
          />
        </section>
      )}

      {adminCan(me, "shops.suspend") && shop.status === "active" && (
        <section aria-labelledby="suspend-heading" className={`${sectionClass} border-rose-200`}>
          <h2 id="suspend-heading" className="mb-1 font-semibold">
            Suspend shop
          </h2>
          <p className="mb-3 text-sm text-zinc-600">
            Customers can&apos;t order or pay until it&apos;s reopened. Paid orders can still be
            delivered and refunded. The owner gets an email.
          </p>
          <ReasonForm
            action={suspendShopAction.bind(null, shop.id)}
            label="Suspend shop"
            pendingLabel="Suspending…"
          />
        </section>
      )}
      {adminCan(me, "shops.suspend") && shop.status === "suspended" && (
        <section aria-labelledby="reopen-heading" className={sectionClass}>
          <h2 id="reopen-heading" className="mb-3 font-semibold">
            Reopen shop
          </h2>
          <ReasonForm
            action={reopenShopAction.bind(null, shop.id)}
            label="Reopen shop"
            pendingLabel="Reopening…"
          />
        </section>
      )}
    </div>
  );
}
