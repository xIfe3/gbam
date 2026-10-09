import { formatNaira } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart, type ChartPoint } from "@/components/admin/bar-chart";
import { rangeFromParams } from "@/components/admin/range";
import { RangePicker } from "@/components/admin/range-picker";
import { rangeProblem, Stat } from "@/components/admin/stat";
import { adminApi, type MoneyOverview } from "@/lib/admin-api";

export const metadata: Metadata = { title: "Money · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Sales, fees and refunds for a range of days (Lagos time), in total, per day and per shop. */
export default async function MoneyPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const range = rangeFromParams(searchParams);

  let overview: MoneyOverview | null = null;
  let problem: string | null = null;
  try {
    overview = await adminApi.money(range);
  } catch (error) {
    problem = rangeProblem(error);
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-ink text-3xl font-black">Money</h1>
      <RangePicker basePath="/admin/money" range={range} />
      {problem && (
        <p role="alert" className="bg-coral-wash text-ink rounded-lg p-4 text-sm">
          {problem}
        </p>
      )}
      {overview && <MoneyReport overview={overview} />}
    </div>
  );
}

function MoneyReport({ overview }: { overview: MoneyOverview }) {
  const totals = overview.totals;
  const points: ChartPoint[] = [];
  for (const day of overview.byDay) {
    points.push({ day: day.day, value: day.salesKobo });
  }

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sales" value={formatNaira(totals.salesKobo)} />
        <Stat label="Paid orders" value={totals.paidOrders.toLocaleString("en-NG")} />
        <Stat label="gbam fees" value={formatNaira(totals.gbamFeesKobo)} />
        <Stat label="Paystack fees" value={formatNaira(totals.paystackFeesKobo)} />
        <Stat label="Items" value={formatNaira(totals.itemsKobo)} />
        <Stat label="Delivery" value={formatNaira(totals.deliveryKobo)} />
        <Stat label="Refunds" value={formatNaira(totals.refundsKobo)} />
      </dl>

      <BarChart title="Sales per day" points={points} unit="naira" />

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 id="sales-by-shop" className="text-ink font-bold">
          Sales by shop
        </h2>
        {overview.byShop.length === 0 && (
          <p className="text-ink-muted mt-2 text-sm">No paid orders in this range.</p>
        )}
        {overview.byShop.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table aria-labelledby="sales-by-shop" className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="py-2">Shop</th>
                  <th className="py-2 text-right">Paid orders</th>
                  <th className="py-2 text-right">Sales</th>
                  <th className="py-2 text-right">gbam fees</th>
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
                {overview.byShop.map((shop) => (
                  <tr key={shop.shopId} className="border-t border-zinc-100">
                    <td className="py-2">
                      <Link href={`/admin/shops/${shop.shopId}`} className="text-brand font-bold">
                        {shop.shopName}
                      </Link>
                    </td>
                    <td className="py-2 text-right">{shop.paidOrders}</td>
                    <td className="py-2 text-right">{formatNaira(shop.salesKobo)}</td>
                    <td className="py-2 text-right">{formatNaira(shop.gbamFeesKobo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
