import { customers, dailyVisits, orderEvents, orders, payments, sellers, type Db } from "@gbam/db";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";

/** One shop's pilot numbers. */
export type PilotShopRow = {
  slug: string;
  /** Where the seller came from (?ref= / utm_source), or null. */
  signupSource: string | null;
  /** Visits to the shop, its products and its checkout (from the page beacon). */
  shopVisits: number;
  ordersPlaced: number;
  /** Orders that reached "waiting for payment" (instant pay: nearly all of them). */
  paymentRequested: number;
  ordersPaid: number;
  /** ordersPaid ÷ ordersPlaced, as a whole percent. 0 when nothing was placed. */
  paidPercent: number;
  /** The middle value of "minutes from order placed to paid". null = nothing paid yet. */
  medianMinutesToPay: number | null;
  /** Customers (phone numbers) with 2 or more paid orders. */
  repeatCustomers: number;
  /** gbam's fee from this shop's successful payments, in kobo. */
  gbamFeeKobo: number;
};

export type PilotReport = {
  since: Date;
  shops: PilotShopRow[];
  /** The day-30 gate: shops with 2 or more paid orders. */
  shopsWithRepeatPaidOrders: number;
};

/** "YYYY-MM-DD" in Lagos time (UTC+1), the same days the visit counters use. */
function lagosDate(time: Date): string {
  return new Date(time.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The middle number of a list (the average of the two middle ones for an even count). */
function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }
  const below = sorted[middle - 1];
  const above = sorted[middle];
  if (below === undefined || above === undefined) {
    return null;
  }
  return Math.round((below + above) / 2);
}

/**
 * The numbers the pilot decision rests on, per shop, for everything since `since`. Read-only:
 * it only counts what's already recorded (orders, their status history, payments, visits).
 * Shops that have closed their account are left out.
 */
export async function pilotReport(db: Db, since: Date): Promise<PilotReport> {
  const shopRows = await db
    .select({ id: sellers.id, slug: sellers.slug, signupSource: sellers.signupSource })
    .from(sellers)
    .where(isNull(sellers.closedAt))
    .orderBy(sellers.createdAt);

  const shops: PilotShopRow[] = [];
  let shopsWithRepeatPaidOrders = 0;

  for (const shop of shopRows) {
    const visitRows = await db
      .select({ total: sql<string>`coalesce(sum(${dailyVisits.visits}), 0)` })
      .from(dailyVisits)
      .where(
        and(
          eq(dailyVisits.sellerId, shop.id),
          inArray(dailyVisits.kind, ["storefront", "product", "checkout"]),
          gte(dailyVisits.day, lagosDate(since)),
        ),
      );
    const shopVisits = Number(visitRows[0]?.total ?? 0);

    const orderRows = await db
      .select({ id: orders.id, createdAt: orders.createdAt, phone: customers.phone })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(and(eq(orders.sellerId, shop.id), gte(orders.createdAt, since)));

    // Skip shops with no activity at all, so the report stays readable.
    if (orderRows.length === 0 && shopVisits === 0) {
      continue;
    }

    const orderIds: string[] = [];
    const placedAtById = new Map<string, Date>();
    const phoneById = new Map<string, string>();
    for (const order of orderRows) {
      orderIds.push(order.id);
      placedAtById.set(order.id, order.createdAt);
      phoneById.set(order.id, order.phone);
    }

    let paymentRequested = 0;
    let ordersPaid = 0;
    const minutesToPay: number[] = [];
    const paidOrdersPerPhone = new Map<string, number>();
    let gbamFeeKobo = 0;

    if (orderIds.length > 0) {
      const events = await db
        .select({
          orderId: orderEvents.orderId,
          toStatus: orderEvents.toStatus,
          createdAt: orderEvents.createdAt,
        })
        .from(orderEvents)
        .where(
          and(
            inArray(orderEvents.orderId, orderIds),
            inArray(orderEvents.toStatus, ["awaiting_payment", "paid"]),
          ),
        );

      // An order can be asked for payment more than once; count each order once.
      const requested = new Set<string>();
      const paidAt = new Map<string, Date>();
      for (const event of events) {
        if (event.toStatus === "awaiting_payment") {
          requested.add(event.orderId);
        } else {
          paidAt.set(event.orderId, event.createdAt);
        }
      }
      paymentRequested = requested.size;
      ordersPaid = paidAt.size;

      for (const [orderId, when] of paidAt) {
        const placedAt = placedAtById.get(orderId);
        if (placedAt) {
          minutesToPay.push(Math.round((when.getTime() - placedAt.getTime()) / 60_000));
        }
        const phone = phoneById.get(orderId);
        if (phone) {
          const before = paidOrdersPerPhone.get(phone) ?? 0;
          paidOrdersPerPhone.set(phone, before + 1);
        }
      }

      const feeRows = await db
        .select({ total: sql<string>`coalesce(sum(${payments.platformFeeKobo}), 0)` })
        .from(payments)
        .where(and(inArray(payments.orderId, orderIds), eq(payments.status, "success")));
      gbamFeeKobo = Number(feeRows[0]?.total ?? 0);
    }

    let repeatCustomers = 0;
    for (const count of paidOrdersPerPhone.values()) {
      if (count >= 2) {
        repeatCustomers = repeatCustomers + 1;
      }
    }

    let paidPercent = 0;
    if (orderRows.length > 0) {
      paidPercent = Math.round((ordersPaid / orderRows.length) * 100);
    }

    if (ordersPaid >= 2) {
      shopsWithRepeatPaidOrders = shopsWithRepeatPaidOrders + 1;
    }

    shops.push({
      slug: shop.slug,
      signupSource: shop.signupSource,
      shopVisits,
      ordersPlaced: orderRows.length,
      paymentRequested,
      ordersPaid,
      paidPercent,
      medianMinutesToPay: median(minutesToPay),
      repeatCustomers,
      gbamFeeKobo,
    });
  }

  return { since, shops, shopsWithRepeatPaidOrders };
}
