import { formatNaira } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { adminCan } from "@/components/admin/admin-nav";
import { lagosDate, rangeHref } from "@/components/admin/range";
import { adminApi } from "@/lib/admin-api";

export const metadata: Metadata = { title: "Admin" };

type Tile = { label: string; value: string; href: string };

/** The admin home: what needs attention, limited to what this admin's role can see. */
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function OverviewPage(props: { searchParams?: SearchParams }) {
  let denied = false;
  if (props.searchParams) {
    const searchParams = await props.searchParams;
    denied = searchParams.denied === "1";
  }
  const me = await adminApi.me();
  const tiles: Tile[] = [];

  if (adminCan(me, "money.view")) {
    const today = lagosDate(new Date());
    const money = await adminApi.money({ from: today, to: today });
    tiles.push({
      label: "Today's sales",
      value: formatNaira(money.totals.salesKobo),
      href: rangeHref("/admin/money", today, today),
    });
  }

  if (adminCan(me, "tickets.view")) {
    const open = await adminApi.tickets({ status: "open" });
    tiles.push({
      label: "Open tickets",
      value: String(open.total),
      href: "/admin/tickets?status=open",
    });
  }
  if (adminCan(me, "refunds.handle")) {
    const refunds = await adminApi.refunds("open");
    tiles.push({
      label: "Refunds waiting",
      value: String(refunds.length),
      href: "/admin/refunds",
    });
  }
  if (adminCan(me, "support.view")) {
    const messages = await adminApi.messages("new");
    tiles.push({
      label: "Contact messages",
      value: String(messages.length),
      href: "/admin/support",
    });
    const issues = await adminApi.issues("open");
    tiles.push({
      label: "Open problem reports",
      value: String(issues.length),
      href: "/admin/support?tab=issues",
    });
  }
  if (adminCan(me, "shops.view")) {
    const suspended = await adminApi.shops({ status: "suspended" });
    tiles.push({
      label: "Suspended shops",
      value: String(suspended.total),
      href: "/admin/shops?status=suspended",
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-ink text-3xl font-black">Hello, {me.name}</h1>
      {denied && (
        <p role="status" className="bg-coral-wash text-ink rounded-lg p-4 text-sm">
          Your role doesn&apos;t allow that page. Ask a superadmin if you need it.
        </p>
      )}
      {tiles.length === 0 && <p className="text-ink-muted">Nothing to show for your role yet.</p>}
      <ul className="grid gap-4 sm:grid-cols-2">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Link
              href={tile.href}
              className="block rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-300"
            >
              <span className="text-ink-muted block text-sm">{tile.label}</span>
              <span className="font-display text-ink block text-4xl font-black">{tile.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
