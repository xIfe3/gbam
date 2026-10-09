import { formatNaira } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { ActiveNow } from "@/components/admin/active-now";
import { BarChart, type ChartPoint } from "@/components/admin/bar-chart";
import { rangeFromParams, shortDay } from "@/components/admin/range";
import { RangePicker } from "@/components/admin/range-picker";
import { rangeProblem, Stat } from "@/components/admin/stat";
import { adminApi, type AnalyticsOverview } from "@/lib/admin-api";
import { activeNowAction } from "../admin-actions";

export const metadata: Metadata = { title: "Analytics · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Who's on Gbam now, plus orders, new sellers and shop visits for a range of days. */
export default async function AnalyticsPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const range = rangeFromParams(searchParams);
  const active = await adminApi.active();

  let overview: AnalyticsOverview | null = null;
  let problem: string | null = null;
  try {
    overview = await adminApi.analytics(range);
  } catch (error) {
    problem = rangeProblem(error);
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-ink text-3xl font-black">Analytics</h1>
      <ActiveNow initial={active} load={activeNowAction} />
      <RangePicker basePath="/admin/analytics" range={range} />
      {problem && (
        <p role="alert" className="bg-coral-wash text-ink rounded-lg p-4 text-sm">
          {problem}
        </p>
      )}
      {overview && <AnalyticsReport overview={overview} />}
    </div>
  );
}

/** 0.6 → "60%" */
function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function AnalyticsReport({ overview }: { overview: AnalyticsOverview }) {
  const orders = overview.orders;
  const visitPoints: ChartPoint[] = [];
  for (const day of overview.visits) {
    // Shop visits = storefront and product pages (checkout visits are the same people).
    visitPoints.push({ day: day.day, value: day.storefront + day.product });
  }
  const visitFunnel = overview.visitFunnel;

  return (
    <>
      <section className="space-y-3">
        <h2 className="text-ink font-bold">Orders</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Placed" value={orders.placed.toLocaleString("en-NG")} />
          <Stat label="Paid" value={orders.paid.toLocaleString("en-NG")} />
          <Stat label="Paid rate" value={percent(orders.paidRate)} />
          <Stat label="Average paid order" value={formatNaira(orders.averageOrderKobo)} />
          <Stat label="Expired unpaid" value={orders.expired.toLocaleString("en-NG")} />
          <Stat label="Cancelled by seller" value={orders.cancelled.toLocaleString("en-NG")} />
          <Stat label="Shops selling (7 days)" value={String(overview.activeShops.last7)} />
          <Stat label="Shops selling (30 days)" value={String(overview.activeShops.last30)} />
        </dl>
      </section>

      <BarChart title="Shop visits per day" points={visitPoints} unit="count" />

      <section className="space-y-3">
        <h2 className="text-ink font-bold">From visit to paid order</h2>
        <dl className="grid grid-cols-3 gap-3">
          <Stat label="Shop visits" value={visitFunnel.visits.toLocaleString("en-NG")} />
          <Stat label="Orders placed" value={visitFunnel.orders.toLocaleString("en-NG")} />
          <Stat label="Orders paid" value={visitFunnel.paid.toLocaleString("en-NG")} />
        </dl>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 id="seller-funnel" className="text-ink font-bold">
          New sellers by week
        </h2>
        <p className="text-ink-muted text-sm">
          Sellers who signed up each week, and how many of them have reached each step so far.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table aria-labelledby="seller-funnel" className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="py-2">Week of</th>
                <th className="py-2 text-right">Signed up</th>
                <th className="py-2 text-right">Verified email</th>
                <th className="py-2 text-right">Added a product</th>
                <th className="py-2 text-right">Added a bank</th>
                <th className="py-2 text-right">First paid order</th>
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
              {overview.funnel.map((week) => (
                <tr key={week.week} className="border-t border-zinc-100">
                  <td className="py-2">{shortDay(week.week)}</td>
                  <td className="py-2 text-right">{week.signedUp}</td>
                  <td className="py-2 text-right">{week.verified}</td>
                  <td className="py-2 text-right">{week.firstProduct}</td>
                  <td className="py-2 text-right">{week.bankAccount}</td>
                  <td className="py-2 text-right">{week.firstPaidOrder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-ink font-bold">Top shops by paid orders</h2>
        {overview.topShops.length === 0 && (
          <p className="text-ink-muted mt-2 text-sm">No paid orders in this range.</p>
        )}
        <ol className="mt-2 space-y-1 text-sm">
          {overview.topShops.map((shop) => (
            <li key={shop.shopId} className="flex justify-between gap-3">
              <Link href={`/admin/shops/${shop.shopId}`} className="text-brand font-bold">
                {shop.shopName}
              </Link>
              <span>{shop.paidOrders}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
