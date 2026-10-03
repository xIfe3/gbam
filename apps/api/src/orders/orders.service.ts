import {
  customers,
  orderEvents,
  orderItems,
  payments,
  orders,
  products,
  sellers,
  type DbTransaction,
} from "@gbam/db";
import {
  assertTransition,
  nextStatuses,
  type CreateOrderInput,
  type OrderActor,
  type OrderStatus,
} from "@gbam/shared";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { NotificationsQueue } from "../notifications/notifications.queue.js";
import { generateOrderCode } from "./order-code.js";

// Order codes are random, so two orders could (rarely) get the same one. If that
// happens we try again with a new code, up to this many times.
const MAX_CODE_ATTEMPTS = 3;

/**
 * All order logic lives here. Controllers (HTTP) and the worker call these methods;
 * they never touch the orders tables directly.
 *
 * `@Injectable()` tells Nest it may create this class and pass it to anyone who asks
 * for it in their constructor (that's "dependency injection").
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly notifications: NotificationsQueue,
  ) {}

  /** Public: a customer places an order on a seller's storefront. */
  async createFromStorefront(slug: string, input: CreateOrderInput) {
    let attempt = 1;
    while (true) {
      try {
        // A transaction means "all of these database writes happen, or none do".
        // If anything inside throws, every write in it is undone.
        const created = await this.db.transaction(async (tx) => {
          return this.insertOrder(tx, slug, input);
        });

        await this.notify(created.eventId, {
          orderId: created.order.id,
          from: null,
          to: "pending",
        });
        return created.order;
      } catch (error) {
        const codeWasTaken = isUniqueViolation(error, "orders_seller_code_uq");
        if (codeWasTaken && attempt < MAX_CODE_ATTEMPTS) {
          // The failed insert cancelled the whole transaction, so start over with a new code.
          attempt = attempt + 1;
          continue;
        }
        throw error;
      }
    }
  }

  /** Seller dashboard list, newest first. `status` is an optional filter. */
  async listForSeller(sellerId: string, status?: OrderStatus) {
    // Every seller query filters by seller_id, so a seller only ever sees their own orders.
    const conditions: SQL[] = [eq(orders.sellerId, sellerId)];
    if (status) {
      conditions.push(eq(orders.status, status));
    }

    const rows = await this.db
      .select({
        id: orders.id,
        code: orders.code,
        status: orders.status,
        totalKobo: orders.totalKobo,
        createdAt: orders.createdAt,
        customerName: customers.name,
        customerPhone: customers.phone,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(and(...conditions)) // `...` spreads the array into separate arguments
      .orderBy(desc(orders.createdAt))
      .limit(100);

    return rows;
  }

  /** One order with its customer, items and status history. */
  async getForSeller(sellerId: string, orderId: string) {
    // `with` loads related rows too (customer, items, events) in one call.
    const order = await this.db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.sellerId, sellerId)),
      with: {
        customer: true,
        items: true,
        events: { orderBy: [asc(orderEvents.createdAt)] },
        // Only the money columns. `raw` (Paystack's full reply) can include the
        // customer's card details, so it never leaves the API.
        payments: {
          columns: {
            id: true,
            status: true,
            amountKobo: true,
            platformFeeKobo: true,
            paystackFeeKobo: true,
            createdAt: true,
          },
          orderBy: [desc(payments.createdAt)],
        },
      },
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    // Which buttons the seller may press next, from the shared state machine.
    const allowedTransitions = nextStatuses(order.status, "seller");
    return { ...order, allowedTransitions };
  }

  /**
   * The ONLY way an order's status changes.
   *
   * It locks the order's row while checking and updating it. Without the lock, two
   * clicks at the same moment (or a click racing a Paystack webhook) could both read
   * the old status, both pass the check, and both update it.
   *
   * `sellerId` makes sure a seller can only change their own orders. It's left out only
   * when the system (a webhook or background job) changes a status.
   */
  async transition(params: {
    orderId: string;
    to: OrderStatus;
    actor: OrderActor;
    sellerId?: string;
  }) {
    const orderId = params.orderId;
    const to = params.to;
    const actor = params.actor;
    const sellerId = params.sellerId;

    if (actor === "seller" && !sellerId) {
      throw new Error("A seller can only change orders in their own store: sellerId is required");
    }

    const result = await this.db.transaction(async (tx) => {
      const conditions: SQL[] = [eq(orders.id, orderId)];
      if (sellerId) {
        conditions.push(eq(orders.sellerId, sellerId));
      }

      // `.for("update")` = SELECT ... FOR UPDATE: lock this row until the transaction ends.
      // Anyone else trying to lock it waits here until we're done.
      const lockedRows = await tx
        .select({ status: orders.status })
        .from(orders)
        .where(and(...conditions))
        .for("update");

      const current = lockedRows[0];
      if (!current) {
        throw new NotFoundException("Order not found");
      }

      // Throws InvalidOrderTransitionError (→ HTTP 409) if this move isn't allowed.
      assertTransition(current.status, to, actor);

      const updatedRows = await tx
        .update(orders)
        .set({ status: to })
        .where(eq(orders.id, orderId))
        .returning();

      const eventRows = await tx
        .insert(orderEvents)
        .values({ orderId, fromStatus: current.status, toStatus: to, actor })
        .returning({ id: orderEvents.id });

      return {
        order: firstRow(updatedRows, "updated order"),
        eventId: firstRow(eventRows, "order event").id,
        from: current.status,
      };
    });

    // Only after the transaction has committed: queue the WhatsApp message.
    await this.notify(result.eventId, { orderId, from: result.from, to });
    return result.order;
  }

  /** Writes a new order. Runs inside the transaction started by createFromStorefront. */
  private async insertOrder(tx: DbTransaction, slug: string, input: CreateOrderInput) {
    const sellerRows = await tx
      .select({ id: sellers.id })
      .from(sellers)
      .where(eq(sellers.slug, slug));
    const seller = sellerRows[0];
    if (!seller) {
      throw new NotFoundException("Store not found");
    }

    // Add up quantities per product, in case the same product appears on two lines.
    const quantityByProductId = new Map<string, number>();
    for (const item of input.items) {
      const quantitySoFar = quantityByProductId.get(item.productId) ?? 0;
      quantityByProductId.set(item.productId, quantitySoFar + item.quantity);
    }
    const productIds = Array.from(quantityByProductId.keys());

    // Only this seller's active products. Someone could send another store's product ids.
    const foundProducts = await tx
      .select({ id: products.id, name: products.name, priceKobo: products.priceKobo })
      .from(products)
      .where(
        and(
          eq(products.sellerId, seller.id),
          eq(products.isActive, true),
          inArray(products.id, productIds),
        ),
      );
    if (foundProducts.length !== productIds.length) {
      throw new BadRequestException("One or more products are unavailable");
    }

    // Prices ALWAYS come from our database, never from what the browser sent.
    let totalKobo = 0;
    const lines = [];
    for (const product of foundProducts) {
      const quantity = quantityByProductId.get(product.id) ?? 0;
      totalKobo = totalKobo + product.priceKobo * quantity;
      lines.push({
        productId: product.id,
        productName: product.name,
        unitPriceKobo: product.priceKobo,
        quantity,
      });
    }

    // "Upsert": create the customer, or if this phone already ordered from this seller,
    // reuse that customer (and update their name).
    const customerRows = await tx
      .insert(customers)
      .values({ sellerId: seller.id, name: input.customer.name, phone: input.customer.phone })
      .onConflictDoUpdate({
        target: [customers.sellerId, customers.phone],
        set: { name: input.customer.name },
      })
      .returning({ id: customers.id });
    const customer = firstRow(customerRows, "customer");

    const orderRows = await tx
      .insert(orders)
      .values({
        sellerId: seller.id,
        customerId: customer.id,
        code: generateOrderCode(),
        totalKobo,
        note: input.note,
      })
      .returning();
    const order = firstRow(orderRows, "order");

    const itemRows = [];
    for (const line of lines) {
      itemRows.push({ ...line, orderId: order.id });
    }
    await tx.insert(orderItems).values(itemRows);

    // First entry in the order's history: (nothing) → pending.
    const eventRows = await tx
      .insert(orderEvents)
      .values({ orderId: order.id, fromStatus: null, toStatus: "pending", actor: "system" })
      .returning({ id: orderEvents.id });
    const event = firstRow(eventRows, "order event");

    return { order, eventId: event.id };
  }

  /**
   * Queues the WhatsApp notification. Runs after the database commit.
   *
   * If Redis is down we log the error but DON'T fail the request: the order is already
   * saved, and an error would make the customer press "order" again and create a
   * duplicate. (Later improvement: a "transactional outbox" so no message is ever lost.)
   */
  private async notify(
    eventId: string,
    job: { orderId: string; from: OrderStatus | null; to: OrderStatus },
  ) {
    try {
      await this.notifications.orderStatusChanged(eventId, job);
    } catch (error) {
      this.logger.error(`Failed to queue notification for event ${eventId}`, error);
    }
  }
}

/** `.returning()` gives back an array. This returns its first row, or fails clearly. */
function firstRow<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`Expected the database to return the ${what}, but it returned nothing`);
  }
  return row;
}

/**
 * True if `error` is Postgres saying "this would create a duplicate" (error code 23505)
 * for the given unique constraint. Drizzle wraps the Postgres error, so we look at the
 * error and at what it wraps (`error.cause`).
 */
function isUniqueViolation(error: unknown, constraintName: string): boolean {
  let current: unknown = error;
  while (current !== null && typeof current === "object") {
    const pgError = current as { code?: string; constraint_name?: string; cause?: unknown };
    if (pgError.code === "23505" && pgError.constraint_name === constraintName) {
      return true;
    }
    current = pgError.cause;
  }
  return false;
}
