import { customers, orderEvents, orderItems, orders, products, sellers } from "@gbam/db";
import {
  assertTransition,
  nextStatuses,
  type CreateOrderInput,
  type OrderActor,
  type OrderStatus,
} from "@gbam/shared";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { NotificationsQueue } from "../notifications/notifications.queue.js";
import { generateOrderCode } from "./order-code.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const MAX_CODE_ATTEMPTS = 3;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly notifications: NotificationsQueue,
  ) {}

  /** Public: a customer places an order on a seller's storefront. */
  async createFromStorefront(slug: string, input: CreateOrderInput) {
    for (let attempt = 1; ; attempt++) {
      try {
        const created = await this.db.transaction((tx) => this.insertOrder(tx, slug, input));
        await this.notify(created.eventId, {
          orderId: created.order.id,
          from: null,
          to: "pending",
        });
        return created.order;
      } catch (error) {
        // A failed insert aborts the transaction, so retry the whole thing with a new code.
        if (attempt < MAX_CODE_ATTEMPTS && isUniqueViolation(error, "orders_seller_code_uq")) {
          continue;
        }
        throw error;
      }
    }
  }

  async listForSeller(sellerId: string, status?: OrderStatus) {
    return this.db
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
      .where(and(eq(orders.sellerId, sellerId), status ? eq(orders.status, status) : undefined))
      .orderBy(desc(orders.createdAt))
      .limit(100);
  }

  async getForSeller(sellerId: string, orderId: string) {
    const order = await this.db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.sellerId, sellerId)),
      with: {
        customer: true,
        items: true,
        events: { orderBy: (e, { asc }) => [asc(e.createdAt)] },
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    // The dashboard renders one button per allowed status.
    return { ...order, allowedTransitions: nextStatuses(order.status, "seller") };
  }

  /**
   * The only way an order's status changes. Locks the row so two concurrent clicks
   * (or a click racing a webhook) can't both pass the state-machine check.
   * `sellerId` scopes the lookup; omit it only for system actors (webhooks).
   */
  async transition(params: {
    orderId: string;
    to: OrderStatus;
    actor: OrderActor;
    sellerId?: string;
  }) {
    const { orderId, to, actor, sellerId } = params;
    if (actor === "seller" && !sellerId) throw new Error("Seller transitions must be scoped");

    const result = await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ status: orders.status })
        .from(orders)
        .where(and(eq(orders.id, orderId), sellerId ? eq(orders.sellerId, sellerId) : undefined))
        .for("update");
      if (!current) throw new NotFoundException("Order not found");

      assertTransition(current.status, to, actor);

      const [order] = await tx
        .update(orders)
        .set({ status: to })
        .where(eq(orders.id, orderId))
        .returning();
      const [event] = await tx
        .insert(orderEvents)
        .values({ orderId, fromStatus: current.status, toStatus: to, actor })
        .returning({ id: orderEvents.id });

      return { order: order!, eventId: event!.id, from: current.status };
    });

    await this.notify(result.eventId, { orderId, from: result.from, to });
    return result.order;
  }

  private async insertOrder(tx: Tx, slug: string, input: CreateOrderInput) {
    const [seller] = await tx
      .select({ id: sellers.id })
      .from(sellers)
      .where(eq(sellers.slug, slug));
    if (!seller) throw new NotFoundException("Store not found");

    // Merge duplicate lines for the same product.
    const quantities = new Map<string, number>();
    for (const item of input.items) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }

    const found = await tx
      .select({ id: products.id, name: products.name, priceKobo: products.priceKobo })
      .from(products)
      .where(
        and(
          eq(products.sellerId, seller.id),
          eq(products.isActive, true),
          inArray(products.id, [...quantities.keys()]),
        ),
      );
    if (found.length !== quantities.size) {
      throw new BadRequestException("One or more products are unavailable");
    }

    // Prices always come from the DB, never from the client.
    const lines = found.map((p) => ({ ...p, quantity: quantities.get(p.id)! }));
    const totalKobo = lines.reduce((sum, l) => sum + l.priceKobo * l.quantity, 0);

    const [customer] = await tx
      .insert(customers)
      .values({ sellerId: seller.id, name: input.customer.name, phone: input.customer.phone })
      .onConflictDoUpdate({
        target: [customers.sellerId, customers.phone],
        set: { name: input.customer.name },
      })
      .returning({ id: customers.id });

    const [order] = await tx
      .insert(orders)
      .values({
        sellerId: seller.id,
        customerId: customer!.id,
        code: generateOrderCode(),
        totalKobo,
        note: input.note,
      })
      .returning();

    await tx.insert(orderItems).values(
      lines.map((l) => ({
        orderId: order!.id,
        productId: l.id,
        productName: l.name,
        unitPriceKobo: l.priceKobo,
        quantity: l.quantity,
      })),
    );

    const [event] = await tx
      .insert(orderEvents)
      .values({ orderId: order!.id, fromStatus: null, toStatus: "pending", actor: "system" })
      .returning({ id: orderEvents.id });

    return { order: order!, eventId: event!.id };
  }

  /**
   * Runs after commit. A Redis outage must not fail the request: the order is already
   * saved, and a 500 would make the customer retry and create a duplicate.
   * TODO: move to a transactional outbox if lost notifications become a problem.
   */
  private async notify(
    eventId: string,
    job: { orderId: string; from: OrderStatus | null; to: OrderStatus },
  ) {
    try {
      await this.notifications.orderStatusChanged(eventId, job);
    } catch (error) {
      this.logger.error(`Failed to enqueue notification for event ${eventId}`, error);
    }
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  // Drizzle wraps driver errors; the postgres-js error is on `cause`.
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const pg = e as { code?: string; constraint_name?: string };
    if (pg.code === "23505" && pg.constraint_name === constraint) return true;
  }
  return false;
}
