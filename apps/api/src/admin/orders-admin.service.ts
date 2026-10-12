import { customers, orderIssues, orders, refundCases, sellers } from "@gbam/db";
import type { OrderStatus } from "@gbam/shared";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { OrdersService } from "../orders/orders.service.js";
import { PaymentsService } from "../payments/payments.service.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AuditService } from "./audit.service.js";

const PAGE_SIZE = 50;

export type OrderListQuery = {
  q?: string;
  status?: OrderStatus;
  shopId?: string;
  from?: Date;
  to?: Date;
  hasIssue?: boolean;
  page: number;
};

/** Every shop's orders, for the admin area (read only), and the refunds to work through. */
@Injectable()
export class OrdersAdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: OrderListQuery) {
    const conditions: SQL[] = [];
    if (query.q && query.q.trim() !== "") {
      const text = query.q.trim();
      const match = or(ilike(orders.code, `%${text}%`), ilike(customers.phone, `%${text}%`));
      if (match) {
        conditions.push(match);
      }
    }
    if (query.status) {
      conditions.push(eq(orders.status, query.status));
    }
    if (query.shopId) {
      conditions.push(eq(orders.sellerId, query.shopId));
    }
    if (query.from) {
      conditions.push(gte(orders.createdAt, query.from));
    }
    if (query.to) {
      conditions.push(lte(orders.createdAt, query.to));
    }
    // Problems the customer reported that aren't resolved yet.
    const openIssues = sql<number>`(select count(*)::int from ${orderIssues} where ${orderIssues.orderId} = ${orders.id} and ${orderIssues.resolvedAt} is null)`;
    if (query.hasIssue === true) {
      conditions.push(sql`${openIssues} > 0`);
    }

    const where = and(...conditions);
    const rows = await this.db
      .select({
        id: orders.id,
        code: orders.code,
        status: orders.status,
        totalKobo: orders.totalKobo,
        createdAt: orders.createdAt,
        customerName: customers.name,
        customerPhone: customers.phone,
        shopId: sellers.id,
        shopName: sellers.businessName,
        openIssues,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .innerJoin(sellers, eq(sellers.id, orders.sellerId))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(PAGE_SIZE)
      .offset((query.page - 1) * PAGE_SIZE);
    const totals = await this.db
      .select({ total: count() })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(where);
    return { rows, total: totals[0]?.total ?? 0, page: query.page, pageSize: PAGE_SIZE };
  }

  /** The same details the seller sees, plus which shop it's from. */
  async detail(orderId: string) {
    const rows = await this.db
      .select({ sellerId: orders.sellerId, slug: sellers.slug, businessName: sellers.businessName })
      .from(orders)
      .innerJoin(sellers, eq(sellers.id, orders.sellerId))
      .where(eq(orders.id, orderId));
    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Order not found");
    }
    const order = await this.orders.getForSeller(row.sellerId, orderId);
    return {
      order,
      shop: { id: row.sellerId, slug: row.slug, businessName: row.businessName },
    };
  }

  // ---- Refunds ----

  async refunds(status: "open" | "resolved") {
    let condition = isNull(refundCases.resolvedAt);
    if (status === "resolved") {
      condition = isNotNull(refundCases.resolvedAt);
    }
    return this.db
      .select({
        id: refundCases.id,
        orderId: orders.id,
        orderCode: orders.code,
        orderStatus: orders.status,
        shopName: sellers.businessName,
        paymentReference: refundCases.paymentReference,
        reason: refundCases.reason,
        amountKobo: refundCases.amountKobo,
        createdAt: refundCases.createdAt,
        resolvedAt: refundCases.resolvedAt,
      })
      .from(refundCases)
      .innerJoin(orders, eq(orders.id, refundCases.orderId))
      .innerJoin(sellers, eq(sellers.id, orders.sellerId))
      .where(condition)
      .orderBy(desc(refundCases.createdAt))
      .limit(200);
  }

  /**
   * The money is back with the customer: mark the order refunded (if it isn't already) and
   * close the case. The order change goes through the normal status rules first (it checks a
   * successful payment exists), then the case is closed with its audit entry.
   */
  async resolveRefund(caseId: string, note: string, actor: AdminContext, ip: string) {
    const caseRows = await this.db.select().from(refundCases).where(eq(refundCases.id, caseId));
    const refundCase = caseRows[0];
    if (!refundCase) {
      throw new NotFoundException("Refund not found");
    }
    if (refundCase.resolvedAt !== null) {
      throw new ConflictException("This refund was already marked done");
    }

    const orderRows = await this.db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, refundCase.orderId));
    const order = orderRows[0];
    if (order && order.status !== "refunded") {
      await this.orders.transition({
        orderId: refundCase.orderId,
        to: "refunded",
        actor: "system",
      });
    }

    await this.db.transaction(async (tx) => {
      // "resolved_at is null" makes this one-shot: a second click at the same moment closes nothing.
      const closed = await tx
        .update(refundCases)
        .set({ resolvedAt: new Date(), resolvedBy: actor.id })
        .where(and(eq(refundCases.id, caseId), isNull(refundCases.resolvedAt)))
        .returning({ id: refundCases.id });
      if (closed.length === 0) {
        throw new ConflictException("This refund was already marked done");
      }
      await this.audit.record(
        {
          adminId: actor.id,
          action: "refund.resolved",
          targetType: "refund_case",
          targetId: caseId,
          note,
          after: { orderId: refundCase.orderId, amountKobo: refundCase.amountKobo },
          ip,
        },
        tx,
      );
    });
    return { ok: true };
  }

  /**
   * "Re-check with Paystack": a customer says they paid but the order isn't marked paid
   * (the webhook may never have come). Asks Paystack directly about the order's unconfirmed
   * payments; if one went through, the order is marked paid the normal way. Safe to press
   * twice: an already-confirmed payment is simply skipped.
   */
  async recheckPayment(orderId: string, actor: AdminContext, ip: string) {
    const orderRows = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, orderId));
    if (orderRows.length === 0) {
      throw new NotFoundException("Order not found");
    }
    const result = await this.payments.recheckOrder(orderId);
    await this.audit.record({
      adminId: actor.id,
      action: "order.payment_rechecked",
      targetType: "order",
      targetId: orderId,
      after: result,
      ip,
    });
    return result;
  }
}
