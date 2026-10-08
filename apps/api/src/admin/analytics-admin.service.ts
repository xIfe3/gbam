import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { daysBetween, lagosEnd, lagosStart, type DayRange } from "./money-admin.service.js";

function num(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return Number(value);
}

/** The Monday on or before this day ("YYYY-MM-DD"). Weeks start on Monday. */
function mondayOf(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  // getUTCDay: Sunday 0 ... Saturday 6. Days back to Monday: Sunday 6, Monday 0, Tuesday 1...
  const back = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}

/** Every Monday from the week of `from` to the week of `to`. */
function weeksBetween(range: DayRange): string[] {
  const weeks: string[] = [];
  const cursor = new Date(`${mondayOf(range.from)}T12:00:00Z`);
  const last = new Date(`${mondayOf(range.to)}T12:00:00Z`);
  while (cursor.getTime() <= last.getTime()) {
    weeks.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return weeks;
}

/**
 * Analytics for the admin area. Reports written in SQL (they count across several tables);
 * `${...}` values are sent separately from the query text, so they can't change it.
 */
@Injectable()
export class AnalyticsAdminService {
  constructor(@InjectDb() private readonly db: Db) {}

  async overview(range: DayRange) {
    const start = lagosStart(range.from);
    const end = lagosEnd(range.to);
    return {
      funnel: await this.funnel(range),
      activeShops: await this.activeShops(),
      orders: await this.orders(start, end),
      topShops: await this.topShops(start, end),
      ...(await this.visits(range, start, end)),
    };
  }

  /**
   * Sellers by the week they signed up, and how many of them reached each step: verified
   * their email, added a product, added a bank account, got a first paid order.
   */
  private async funnel(range: DayRange) {
    const rows = await this.db.execute(sql`
      select to_char(date_trunc('week', s.created_at at time zone 'Africa/Lagos')::date, 'YYYY-MM-DD') as week,
             count(*) as signed_up,
             count(*) filter (where u.email_verified_at is not null) as verified,
             count(*) filter (where exists (select 1 from products p where p.seller_id = s.id)) as first_product,
             count(*) filter (where s.paystack_subaccount_code is not null) as bank_account,
             count(*) filter (where exists (
               select 1 from orders o join order_events e on e.order_id = o.id and e.to_status = 'paid'
               where o.seller_id = s.id)) as first_paid
      from sellers s
      left join users u on u.id = s.owner_user_id
      where s.created_at >= ${lagosStart(mondayOf(range.from))}::timestamptz
        and s.created_at <= ${lagosEnd(range.to)}::timestamptz
      group by week`);
    const byWeek = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      byWeek.set(String(row.week), row);
    }
    const funnel = [];
    for (const week of weeksBetween(range)) {
      const row = byWeek.get(week) ?? {};
      funnel.push({
        week,
        signedUp: num(row.signed_up),
        verified: num(row.verified),
        firstProduct: num(row.first_product),
        bankAccount: num(row.bank_account),
        firstPaidOrder: num(row.first_paid),
      });
    }
    return funnel;
  }

  /** Shops with a paid order in the last 7 and 30 days. */
  private async activeShops() {
    const rows = await this.db.execute(sql`
      select count(distinct o.seller_id) filter (where e.created_at >= now() - interval '7 days') as last7,
             count(distinct o.seller_id) as last30
      from order_events e join orders o on o.id = e.order_id
      where e.to_status = 'paid' and e.created_at >= now() - interval '30 days'`);
    const row = rows[0] ?? {};
    return { last7: num(row.last7), last30: num(row.last30) };
  }

  /** Orders placed, paid, expired (cancelled by the system) and cancelled (by the seller). */
  private async orders(start: string, end: string) {
    const placedRows = await this.db.execute(sql`
      select count(*) as placed from orders
      where created_at >= ${start}::timestamptz and created_at <= ${end}::timestamptz`);
    const eventRows = await this.db.execute(sql`
      select count(*) filter (where e.to_status = 'paid') as paid,
             count(*) filter (where e.to_status = 'cancelled' and e.actor = 'system') as expired,
             count(*) filter (where e.to_status = 'cancelled' and e.actor = 'seller') as cancelled,
             avg(o.total_kobo) filter (where e.to_status = 'paid') as average_order
      from order_events e join orders o on o.id = e.order_id
      where e.created_at >= ${start}::timestamptz and e.created_at <= ${end}::timestamptz`);
    const placed = num(placedRows[0]?.placed);
    const events = eventRows[0] ?? {};
    const paid = num(events.paid);
    let paidRate = 0;
    if (placed > 0) {
      paidRate = paid / placed;
    }
    return {
      placed,
      paid,
      expired: num(events.expired),
      cancelled: num(events.cancelled),
      paidRate,
      averageOrderKobo: Math.round(num(events.average_order)),
    };
  }

  /** The 10 shops with the most paid orders in the range. */
  private async topShops(start: string, end: string) {
    const rows = await this.db.execute(sql`
      select s.id, s.business_name, count(*) as paid_orders
      from order_events e
      join orders o on o.id = e.order_id
      join sellers s on s.id = o.seller_id
      where e.to_status = 'paid'
        and e.created_at >= ${start}::timestamptz and e.created_at <= ${end}::timestamptz
      group by s.id, s.business_name
      order by paid_orders desc
      limit 10`);
    const shops = [];
    for (const row of rows) {
      shops.push({
        shopId: String(row.id),
        shopName: String(row.business_name),
        paidOrders: num(row.paid_orders),
      });
    }
    return shops;
  }

  /** Visits per day (from the page beacon, copied into daily_visits) and the visit funnel. */
  private async visits(range: DayRange, start: string, end: string) {
    const rows = await this.db.execute(sql`
      select to_char(day, 'YYYY-MM-DD') as day, kind, coalesce(sum(visits), 0) as visits
      from daily_visits
      where day >= ${range.from}::date and day <= ${range.to}::date
      group by day, kind`);
    const byDay = new Map<string, { storefront: number; product: number; checkout: number }>();
    for (const row of rows) {
      const day = String(row.day);
      let counts = byDay.get(day);
      if (!counts) {
        counts = { storefront: 0, product: 0, checkout: 0 };
        byDay.set(day, counts);
      }
      const kind = String(row.kind);
      if (kind === "storefront" || kind === "product" || kind === "checkout") {
        counts[kind] = num(row.visits);
      }
    }

    const visits = [];
    let shopVisits = 0;
    for (const day of daysBetween(range)) {
      const counts = byDay.get(day) ?? { storefront: 0, product: 0, checkout: 0 };
      visits.push({ day, ...counts });
      shopVisits = shopVisits + counts.storefront + counts.product;
    }

    const orders = await this.orders(start, end);
    return {
      visits,
      visitFunnel: { visits: shopVisits, orders: orders.placed, paid: orders.paid },
    };
  }
}
