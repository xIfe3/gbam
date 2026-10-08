import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";

/** A range of whole Lagos days, "YYYY-MM-DD" to "YYYY-MM-DD" (both included). */
export type DayRange = { from: string; to: string };

export type MoneyTotals = {
  salesKobo: number;
  itemsKobo: number;
  deliveryKobo: number;
  gbamFeesKobo: number;
  paystackFeesKobo: number;
  refundsKobo: number;
  paidOrders: number;
};

/** Lagos is UTC+1 all year, so a Lagos day starts at 23:00 UTC the day before. */
export function lagosStart(day: string): string {
  return `${day}T00:00:00+01:00`;
}
export function lagosEnd(day: string): string {
  return `${day}T23:59:59.999+01:00`;
}

/** Every day from `from` to `to`, as "YYYY-MM-DD". */
export function daysBetween(range: DayRange): string[] {
  const days: string[] = [];
  const cursor = new Date(`${range.from}T12:00:00Z`);
  const last = new Date(`${range.to}T12:00:00Z`);
  while (cursor.getTime() <= last.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Postgres returns sums as text (they can be huge); this turns them into numbers. */
function num(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return Number(value);
}

/**
 * The money overview. A sale is a successful payment, dated by when its order became "paid";
 * a refund is dated by when its order became "refunded". Days are Lagos days.
 */
@Injectable()
export class MoneyAdminService {
  constructor(@InjectDb() private readonly db: Db) {}

  async overview(range: DayRange) {
    const start = lagosStart(range.from);
    const end = lagosEnd(range.to);

    // Paid orders in the range: the "paid" event, its order, and its successful payment.
    // `sql` writes the query by hand (it's a report across several tables); ${...} values
    // are sent separately from the text, so they can't change the query.
    const paidInRange = sql`
      select o.id as order_id, o.seller_id, o.subtotal_kobo, o.delivery_fee_kobo,
             p.amount_kobo, p.platform_fee_kobo, coalesce(p.paystack_fee_kobo, 0) as paystack_fee_kobo,
             to_char((e.created_at at time zone 'Africa/Lagos')::date, 'YYYY-MM-DD') as day
      from order_events e
      join orders o on o.id = e.order_id
      join payments p on p.order_id = o.id and p.status = 'success'
      where e.to_status = 'paid'
        and e.created_at >= ${start}::timestamptz and e.created_at <= ${end}::timestamptz`;

    const totalRows = await this.db.execute(sql`
      select coalesce(sum(amount_kobo), 0) as sales, coalesce(sum(subtotal_kobo), 0) as items,
             coalesce(sum(delivery_fee_kobo), 0) as delivery,
             coalesce(sum(platform_fee_kobo), 0) as gbam_fees,
             coalesce(sum(paystack_fee_kobo), 0) as paystack_fees,
             count(distinct order_id) as paid_orders
      from (${paidInRange}) paid`);
    const refundRows = await this.db.execute(sql`
      select coalesce(sum(p.amount_kobo), 0) as refunds
      from order_events e
      join payments p on p.order_id = e.order_id and p.status = 'success'
      where e.to_status = 'refunded'
        and e.created_at >= ${start}::timestamptz and e.created_at <= ${end}::timestamptz`);
    const dayRows = await this.db.execute(sql`
      select day, coalesce(sum(amount_kobo), 0) as sales, count(distinct order_id) as paid_orders
      from (${paidInRange}) paid group by day`);
    const shopRows = await this.db.execute(sql`
      select paid.seller_id, s.business_name, coalesce(sum(paid.amount_kobo), 0) as sales,
             count(distinct paid.order_id) as paid_orders,
             coalesce(sum(paid.platform_fee_kobo), 0) as gbam_fees
      from (${paidInRange}) paid
      join sellers s on s.id = paid.seller_id
      group by paid.seller_id, s.business_name
      order by sales desc
      limit 50`);

    const totalsRow = totalRows[0] ?? {};
    const totals: MoneyTotals = {
      salesKobo: num(totalsRow.sales),
      itemsKobo: num(totalsRow.items),
      deliveryKobo: num(totalsRow.delivery),
      gbamFeesKobo: num(totalsRow.gbam_fees),
      paystackFeesKobo: num(totalsRow.paystack_fees),
      refundsKobo: num(refundRows[0]?.refunds),
      paidOrders: num(totalsRow.paid_orders),
    };

    // Every day in the range, with zeros for days with no sales (so a chart has no gaps).
    const salesByDay = new Map<string, { salesKobo: number; paidOrders: number }>();
    for (const row of dayRows) {
      salesByDay.set(String(row.day), {
        salesKobo: num(row.sales),
        paidOrders: num(row.paid_orders),
      });
    }
    const byDay = [];
    for (const day of daysBetween(range)) {
      const found = salesByDay.get(day);
      if (found) {
        byDay.push({ day, ...found });
      } else {
        byDay.push({ day, salesKobo: 0, paidOrders: 0 });
      }
    }

    const byShop = [];
    for (const row of shopRows) {
      byShop.push({
        shopId: String(row.seller_id),
        shopName: String(row.business_name),
        salesKobo: num(row.sales),
        paidOrders: num(row.paid_orders),
        gbamFeesKobo: num(row.gbam_fees),
      });
    }

    return { totals, byDay, byShop };
  }
}
