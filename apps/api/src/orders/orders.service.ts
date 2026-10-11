import {
  customers,
  deliveryZones,
  orderEvents,
  orderIssues,
  orderItems,
  payments,
  refundCases,
  whatsappMessages,
  orders,
  productVariants,
  products,
  sellers,
  users,
  type DbTransaction,
} from "@gbam/db";
import {
  assertTransition,
  DELIVERY_LIMITS,
  formatNaira,
  nextStatuses,
  type CreateOrderInput,
  type OrderDeliveryInput,
  type OrderActor,
  type OrderStatus,
} from "@gbam/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { isUniqueViolation } from "../common/db-errors.js";
import { EmailQueue } from "../email/email.queue.js";
import type { EmailJob } from "../email/templates.js";
import { ENV, type Env } from "../env.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { paymentMethodLabel } from "../payments/payment-method-label.js";
import { NotificationsQueue } from "../notifications/notifications.queue.js";
import { generateOrderCode } from "./order-code.js";
import { reduceStockForPaidOrder, variantDisplayName } from "./stock.js";
import { RateLimiter, TooManyRequestsError } from "../common/rate-limiter.js";
import { payPageUrl } from "../payments/checkout-links.js";

// Order codes are random, so two orders could (rarely) get the same one. If that
// happens we try again with a new code, up to this many times.
const MAX_CODE_ATTEMPTS = 3;

// Same cap as one line in createOrderSchema; checked again after duplicate lines are merged.
const MAX_QUANTITY_PER_VARIANT = 99;

/** A seller can resend a payment request at most this often, per order. */
const PAYMENT_RESEND_GAP_SECONDS = 10 * 60;

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
    private readonly emails: EmailQueue,
    @Inject(ENV) private readonly env: Env,
    private readonly limiter: RateLimiter,
  ) {}

  /** The customer's private tracking link, e.g. https://gbam.app/track/GB-7K3Q?k=… */
  trackingUrl(code: string, trackingKey: string): string {
    return `${this.env.WEB_URL}/track/${code}?k=${trackingKey}`;
  }

  /**
   * If the customer gave an email, queue a receipt with the code and tracking link. A failure
   * here must never undo the order (it's already saved), so it's logged, not thrown.
   */
  private async sendReceipt(
    order: {
      id: string;
      code: string;
      sellerId: string;
      subtotalKobo: number;
      deliveryFeeKobo: number;
      deliveryZoneName: string | null;
      totalKobo: number;
      trackingKey: string;
    },
    email: string,
  ) {
    try {
      const shopRows = await this.db
        .select({ businessName: sellers.businessName })
        .from(sellers)
        .where(eq(sellers.id, order.sellerId));
      let shopName = "your shop";
      const shop = shopRows[0];
      if (shop) {
        shopName = shop.businessName;
      }
      // jobId per order: queuing it twice still sends one email.
      await this.emails.send(`receipt-${order.id}`, {
        kind: "order_receipt",
        to: email,
        shopName,
        code: order.code,
        subtotalKobo: order.subtotalKobo,
        deliveryFeeKobo: order.deliveryFeeKobo,
        deliveryLabel: order.deliveryZoneName,
        totalKobo: order.totalKobo,
        trackingUrl: this.trackingUrl(order.code, order.trackingKey),
      });
    } catch (error) {
      let reason = "error";
      if (error instanceof Error) {
        reason = error.message;
      }
      this.logger.error(`Could not queue the receipt for order ${order.code}: ${reason}`);
    }
  }

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
        if (input.customer.email) {
          await this.sendReceipt(created.order, input.customer.email);
        }
        await this.emailSellerNewOrder(created.order.id);
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
        // How many problems the customer reported that the seller hasn't resolved yet.
        openIssues: sql<number>`(select count(*)::int from ${orderIssues} where ${orderIssues.orderId} = ${orders.id} and ${orderIssues.resolvedAt} is null)`,
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
            reference: true,
            status: true,
            amountKobo: true,
            platformFeeKobo: true,
            paystackFeeKobo: true,
            createdAt: true,
          },
          orderBy: [desc(payments.createdAt)],
        },
        whatsappMessages: { orderBy: [asc(whatsappMessages.createdAt)] },
        issues: { orderBy: [desc(orderIssues.createdAt)] },
      },
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    // Which buttons the seller may press next, from the shared state machine.
    const allowedTransitions = nextStatuses(order.status, "seller");
    // While payment is due: the customer's pay link, for the seller's "Copy payment link".
    let payLink: string | null = null;
    if (order.status === "awaiting_payment") {
      payLink = payPageUrl(this.env.WEB_URL, order.code, order.trackingKey);
    }
    return { ...order, allowedTransitions, payLink };
  }

  /**
   * "Resend payment request": the customer lost the WhatsApp message (deleted the chat...),
   * so it's sent again with the same link. At most once every 10 minutes per order.
   */
  async resendPaymentRequest(sellerId: string, orderId: string) {
    const rows = await this.db
      .select({ status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.sellerId, sellerId)));
    const order = rows[0];
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    if (order.status !== "awaiting_payment") {
      throw new ConflictException("Only orders waiting for payment can be sent a payment request");
    }
    const limit = await this.limiter.hit(
      `payment-resend:${orderId}`,
      1,
      PAYMENT_RESEND_GAP_SECONDS,
    );
    if (!limit.allowed) {
      throw new TooManyRequestsError(limit.retryAfterSeconds);
    }
    await this.notifications.paymentResend(orderId);
    return { nextAllowedAt: new Date(Date.now() + PAYMENT_RESEND_GAP_SECONDS * 1000) };
  }

  /** The seller marks a customer's problem as dealt with. Another shop's issue → 404. */
  async resolveIssue(sellerId: string, orderId: string, issueId: string) {
    const owned = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.sellerId, sellerId)));
    if (owned.length === 0) {
      throw new NotFoundException("Order not found");
    }
    const updated = await this.db
      .update(orderIssues)
      .set({ resolvedAt: new Date() })
      .where(and(eq(orderIssues.id, issueId), eq(orderIssues.orderId, orderId)))
      .returning({ id: orderIssues.id, resolvedAt: orderIssues.resolvedAt });
    const issue = updated[0];
    if (!issue) {
      throw new NotFoundException("Problem not found");
    }
    return issue;
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

      // A seller can only ask for payment once Paystack knows where to send their money.
      // (The system actor is not limited: it never starts a payment request itself.)
      if (actor === "seller" && to === "awaiting_payment") {
        await assertHasPayoutAccount(tx, sellerId);
      }

      // "Refunded" only makes sense if money actually came in. A cancelled order that was
      // never paid has nothing to give back, so the seller can't mark it refunded.
      if (to === "refunded") {
        const paidRows = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(and(eq(payments.orderId, orderId), eq(payments.status, "success")))
          .limit(1);
        if (paidRows.length === 0) {
          throw new ConflictException("This order has no successful payment to refund.");
        }
      }

      const updatedRows = await tx
        .update(orders)
        .set({ status: to })
        .where(eq(orders.id, orderId))
        .returning();

      const eventRows = await tx
        .insert(orderEvents)
        .values({ orderId, fromStatus: current.status, toStatus: to, actor })
        .returning({ id: orderEvents.id });

      // Stock comes off only here, when payment is confirmed. A duplicate "paid" webhook
      // never gets this far: assertTransition above refuses paid -> paid.
      let shortfall = false;
      if (to === "paid") {
        const stockResult = await reduceStockForPaidOrder(tx, orderId);
        shortfall = stockResult.shortfall;
      }

      return {
        order: firstRow(updatedRows, "updated order"),
        eventId: firstRow(eventRows, "order event").id,
        from: current.status,
        shortfall,
      };
    });

    if (result.shortfall) {
      // Logging must never stop the customer's "paid" message from being queued below.
      try {
        const sellerRows = await this.db
          .select({ slug: sellers.slug })
          .from(sellers)
          .where(eq(sellers.id, result.order.sellerId));
        const storeSlug = sellerRows[0]?.slug ?? "unknown";
        this.logger.error(
          `STOCK SHORTFALL on order ${result.order.code} (store ${storeSlug}). NEEDS REFUND.`,
        );
      } catch (error) {
        this.logger.error(`STOCK SHORTFALL on order ${result.order.code}. NEEDS REFUND.`, error);
      }
      await this.emailSupportNeedsRefund(
        orderId,
        "The customer paid, but there wasn't enough stock left for this order.",
        null,
      );
    }

    // Only after the transaction has committed: queue the WhatsApp message and emails.
    await this.notify(result.eventId, { orderId, from: result.from, to });
    await this.emailAfterStatusChange(orderId, to, result.eventId);
    return result.order;
  }

  // ---- Emails ----
  //
  // Every email below is sent AFTER the database change has committed, and a failure is
  // logged, never thrown: the order is already saved, and an email problem must not turn
  // a successful action into an error. Each job id is fixed for that event, so if the same
  // email is queued twice (a retry), the queue keeps only one and it is sent once.

  /** The seller's dashboard page for an order. */
  private dashboardOrderUrl(orderId: string): string {
    return `${this.env.WEB_URL}/dashboard/orders/${orderId}`;
  }

  /** Everything the order emails need, in one query. null if the order is gone. */
  private async loadEmailDetails(orderId: string) {
    const rows = await this.db
      .select({
        code: orders.code,
        subtotalKobo: orders.subtotalKobo,
        deliveryFeeKobo: orders.deliveryFeeKobo,
        deliveryZoneName: orders.deliveryZoneName,
        totalKobo: orders.totalKobo,
        trackingKey: orders.trackingKey,
        customerEmail: orders.customerEmail,
        customerName: customers.name,
        shopName: sellers.businessName,
        slug: sellers.slug,
        newOrderEmails: sellers.newOrderEmails,
        // A left join: a shop with no owner account (like test shops) gets no email.
        ownerEmail: users.email,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .innerJoin(sellers, eq(sellers.id, orders.sellerId))
      .leftJoin(users, eq(users.id, sellers.ownerUserId))
      .where(eq(orders.id, orderId));
    const details = rows[0];
    if (!details) {
      return null;
    }
    return details;
  }

  /**
   * How the order was paid, for the customer's "Payment confirmed" email: the newest
   * successful payment's method and Paystack reference. Both null if there's none.
   */
  private async paidWith(orderId: string) {
    const rows = await this.db
      .select({ reference: payments.reference, method: payments.method, raw: payments.raw })
      .from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.status, "success")))
      .orderBy(desc(payments.updatedAt))
      .limit(1);
    const payment = rows[0];
    if (!payment) {
      return { label: null, reference: null };
    }
    return { label: paymentMethodLabel(payment.method, payment.raw), reference: payment.reference };
  }

  /** Queues one email; logs instead of throwing if the queue can't take it. */
  private async queueEmail(jobId: string, job: EmailJob) {
    try {
      await this.emails.send(jobId, job);
    } catch (error) {
      let reason = "error";
      if (error instanceof Error) {
        reason = error.message;
      }
      this.logger.error(`Could not queue the ${job.kind} email (${jobId}): ${reason}`);
    }
  }

  /** "New order" to the seller, unless they turned these off in Settings. */
  private async emailSellerNewOrder(orderId: string) {
    try {
      const details = await this.loadEmailDetails(orderId);
      if (!details || !details.ownerEmail || !details.newOrderEmails) {
        return;
      }
      await this.queueEmail(`new-order-${orderId}`, {
        kind: "new_order",
        to: details.ownerEmail,
        shopName: details.shopName,
        code: details.code,
        customerName: details.customerName,
        subtotalKobo: details.subtotalKobo,
        deliveryFeeKobo: details.deliveryFeeKobo,
        deliveryLabel: details.deliveryZoneName,
        totalKobo: details.totalKobo,
        orderUrl: this.dashboardOrderUrl(orderId),
        settingsUrl: `${this.env.WEB_URL}/dashboard/settings`,
      });
    } catch (error) {
      this.logger.error(`Could not prepare the new-order email for order ${orderId}`, error);
    }
  }

  /**
   * Emails that go out when an order moves to a new status:
   * - paid: "payment received" to the seller, "payment confirmed" to the customer
   * - cancelled / refunded: to the customer
   * Customers only get emails if they gave an address at checkout.
   */
  private async emailAfterStatusChange(orderId: string, to: OrderStatus, eventId: string) {
    const statusesWithEmails: OrderStatus[] = ["paid", "cancelled", "refunded"];
    if (!statusesWithEmails.includes(to)) {
      return;
    }
    try {
      const details = await this.loadEmailDetails(orderId);
      if (!details) {
        return;
      }
      const trackingUrl = this.trackingUrl(details.code, details.trackingKey);

      if (to === "paid" && details.ownerEmail) {
        await this.queueEmail(`paid-seller-${eventId}`, {
          kind: "payment_received",
          to: details.ownerEmail,
          shopName: details.shopName,
          code: details.code,
          customerName: details.customerName,
          totalKobo: details.totalKobo,
          orderUrl: this.dashboardOrderUrl(orderId),
        });
      }

      const customerEmail = details.customerEmail;
      if (!customerEmail) {
        return;
      }
      if (to === "paid") {
        const paid = await this.paidWith(orderId);
        await this.queueEmail(`paid-customer-${eventId}`, {
          kind: "payment_confirmed",
          to: customerEmail,
          shopName: details.shopName,
          code: details.code,
          subtotalKobo: details.subtotalKobo,
          deliveryFeeKobo: details.deliveryFeeKobo,
          deliveryLabel: details.deliveryZoneName,
          totalKobo: details.totalKobo,
          trackingUrl,
          paidWith: paid.label,
          paymentReference: paid.reference,
        });
      } else if (to === "cancelled") {
        await this.queueEmail(`cancelled-${eventId}`, {
          kind: "order_cancelled",
          to: customerEmail,
          shopName: details.shopName,
          code: details.code,
          trackingUrl,
        });
      } else if (to === "refunded") {
        await this.queueEmail(`refunded-${eventId}`, {
          kind: "order_refunded",
          to: customerEmail,
          shopName: details.shopName,
          code: details.code,
          totalKobo: details.totalKobo,
          trackingUrl,
        });
      }
    } catch (error) {
      this.logger.error(`Could not prepare the "${to}" emails for order ${orderId}`, error);
    }
  }

  /**
   * Tells our support inbox that a customer paid money we can't keep, so someone refunds
   * them. Before, this was only a log line, which nobody reads in time.
   * `paymentReference` null = use the order's successful payment, if there is one.
   */
  async emailSupportNeedsRefund(orderId: string, reason: string, paymentReference: string | null) {
    try {
      const details = await this.loadEmailDetails(orderId);
      if (!details) {
        return;
      }
      let reference = paymentReference;
      if (reference === null) {
        const paidRows = await this.db
          .select({ reference: payments.reference })
          .from(payments)
          .where(and(eq(payments.orderId, orderId), eq(payments.status, "success")))
          .orderBy(desc(payments.createdAt))
          .limit(1);
        const paid = paidRows[0];
        if (paid) {
          reference = paid.reference;
        }
      }
      // One email per payment (a repeated webhook for the same payment sends nothing new).
      let jobId = `needs-refund-${orderId}`;
      if (reference !== null) {
        jobId = `needs-refund-${reference}`;
      }
      // A case for the admin Refunds list. One per payment: a repeated webhook adds nothing.
      await this.openRefundCase(orderId, reference, reason, details.totalKobo);
      await this.queueEmail(jobId, {
        kind: "needs_refund",
        orderCode: details.code,
        shopName: details.shopName,
        slug: details.slug,
        totalKobo: details.totalKobo,
        reason,
        paymentReference: reference,
      });
    } catch (error) {
      this.logger.error(`Could not prepare the needs-refund email for order ${orderId}`, error);
    }
  }

  /** Writes a new order. Runs inside the transaction started by createFromStorefront. */
  private async insertOrder(tx: DbTransaction, slug: string, input: CreateOrderInput) {
    const sellerRows = await tx
      .select({ id: sellers.id, suspendedAt: sellers.suspendedAt })
      .from(sellers)
      // No new orders for a closed shop (its owner deleted the account).
      .where(and(eq(sellers.slug, slug), isNull(sellers.closedAt)));
    const seller = sellerRows[0];
    if (!seller) {
      throw new NotFoundException("Store not found");
    }
    // Suspended by Gbam (e.g. while a report is checked): the shop exists but takes no orders.
    if (seller.suspendedAt !== null) {
      throw new ConflictException("This shop isn't taking orders right now");
    }

    // Add up quantities per variant, in case the same variant appears on two lines.
    const quantityByVariantId = new Map<string, number>();
    for (const item of input.items) {
      const quantitySoFar = quantityByVariantId.get(item.variantId) ?? 0;
      quantityByVariantId.set(item.variantId, quantitySoFar + item.quantity);
    }
    const variantIds = Array.from(quantityByVariantId.keys());
    for (const quantity of quantityByVariantId.values()) {
      if (quantity > MAX_QUANTITY_PER_VARIANT) {
        throw new BadRequestException({
          statusCode: 400,
          message: `You can order at most ${MAX_QUANTITY_PER_VARIANT} of one item`,
          field: "items",
        });
      }
    }

    // Lock the owning products first. A product save locks the product (FOR UPDATE) and
    // then edits or deletes its variants. If we only locked variants, our order item
    // insert (which also checks the product row) could wait on the save while the save
    // waits on us: a deadlock. And the save could delete a variant this order is about to
    // use. `.for("share")` = SELECT ... FOR SHARE: orders can run side by side, but we and
    // a save take turns. Same lock order as the save: products (by id), then variants.
    const variantOwners = await tx
      .select({ productId: productVariants.productId })
      .from(productVariants)
      .where(inArray(productVariants.id, variantIds));
    const ownerIds: string[] = [];
    for (const owner of variantOwners) {
      if (!ownerIds.includes(owner.productId)) {
        ownerIds.push(owner.productId);
      }
    }
    if (ownerIds.length > 0) {
      await tx
        .select({ id: products.id })
        .from(products)
        .where(inArray(products.id, ownerIds))
        .orderBy(asc(products.id))
        .for("share");
    }

    // Only this seller's variants that can be bought right now: the product is active and
    // the variant is enabled and not archived. Someone could send another store's ids.
    // Read after the product lock, so a save can't change them before we commit.
    const foundVariants = await tx
      .select({
        variantId: productVariants.id,
        variantTitle: productVariants.title,
        priceKobo: productVariants.priceKobo,
        stock: productVariants.stock,
        productId: products.id,
        productName: products.name,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          inArray(productVariants.id, variantIds),
          eq(products.sellerId, seller.id),
          eq(products.status, "active"),
          eq(productVariants.isEnabled, true),
          isNull(productVariants.archivedAt),
        ),
      )
      .orderBy(asc(productVariants.id));
    if (foundVariants.length !== variantIds.length) {
      // Find which item went missing so the message can name it. Only this seller's own
      // variants are looked up: an id from another shop must not reveal that shop's names.
      const foundIds = new Set<string>();
      for (const found of foundVariants) {
        foundIds.add(found.variantId);
      }
      const missingIds: string[] = [];
      for (const variantId of variantIds) {
        if (!foundIds.has(variantId)) {
          missingIds.push(variantId);
        }
      }
      const missingRows = await tx
        .select({ productName: products.name, variantTitle: productVariants.title })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(and(inArray(productVariants.id, missingIds), eq(products.sellerId, seller.id)))
        .orderBy(asc(productVariants.id))
        .limit(1);
      const missing = missingRows[0];
      if (missing) {
        const name = variantDisplayName(missing.productName, missing.variantTitle);
        throw new BadRequestException(`${name} is no longer available`);
      }
      throw new BadRequestException("One or more products are unavailable");
    }

    // Prices ALWAYS come from our database, never from what the browser sent.
    let totalKobo = 0;
    const lines = [];
    for (const found of foundVariants) {
      const quantity = quantityByVariantId.get(found.variantId) ?? 0;
      const name = variantDisplayName(found.productName, found.variantTitle);

      // stock null = untracked, so any quantity is fine.
      if (found.stock !== null && found.stock < quantity) {
        let message = `${name} has only ${found.stock} left`;
        if (found.stock === 0) {
          message = `${name} is sold out`;
        }
        throw new BadRequestException({ statusCode: 400, message, field: "items" });
      }

      totalKobo = totalKobo + found.priceKobo * quantity;
      lines.push({
        productId: found.productId,
        variantId: found.variantId,
        productName: found.productName,
        variantTitle: found.variantTitle,
        unitPriceKobo: found.priceKobo,
        quantity,
      });
    }

    const delivery = await this.chooseDelivery(tx, seller.id, input.delivery);

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
        subtotalKobo: totalKobo,
        // What the customer pays: the items plus delivery.
        totalKobo: totalKobo + delivery.feeKobo,
        deliveryFeeKobo: delivery.feeKobo,
        deliveryZoneName: delivery.zoneName,
        deliveryIsPickup: delivery.isPickup,
        deliveryAddress: delivery.address,
        deliveryLandmark: delivery.landmark,
        note: input.note,
        customerEmail: input.customer.email,
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
   * Works out the delivery part of a new order, inside the order's transaction. The fee is
   * read from the database: the browser only says which zone, and what fee it showed, so a
   * changed or removed zone is refused instead of charging a price the customer never saw.
   */
  private async chooseDelivery(
    tx: DbTransaction,
    sellerId: string,
    input: OrderDeliveryInput | undefined,
  ) {
    const liveZones = await tx
      .select()
      .from(deliveryZones)
      .where(and(eq(deliveryZones.sellerId, sellerId), isNull(deliveryZones.archivedAt)));

    // No delivery details at all: an older checkout, during a deploy. Fine for a shop with
    // no zones (that's how orders worked before); a shop with zones needs one picked.
    if (input === undefined) {
      if (liveZones.length > 0) {
        throw new BadRequestException({ field: "delivery", message: "Choose a delivery option" });
      }
      return { zoneName: null, feeKobo: 0, isPickup: false, address: null, landmark: null };
    }

    let zoneName: string | null = null;
    let feeKobo = 0;
    let isPickup = false;

    if (input.zoneId === null) {
      if (liveZones.length > 0) {
        throw new BadRequestException({ field: "delivery", message: "Choose a delivery option" });
      }
    } else {
      let zone: (typeof liveZones)[number] | undefined = undefined;
      for (const candidate of liveZones) {
        if (candidate.id === input.zoneId) {
          zone = candidate;
        }
      }
      // Removed, or another shop's id: either way the customer must pick again.
      if (!zone) {
        throw new ConflictException({
          field: "delivery",
          message: "That delivery option isn't available any more. Please pick another.",
        });
      }
      if (zone.feeKobo !== input.expectedFeeKobo) {
        throw new ConflictException({
          field: "delivery",
          message: `Delivery to ${zone.name} is now ${formatNaira(zone.feeKobo)}. Please check and confirm.`,
        });
      }
      zoneName = zone.name;
      feeKobo = zone.feeKobo;
      isPickup = zone.isPickup;
    }

    // Pickup: nothing to deliver, so anything typed in the address boxes is dropped.
    if (isPickup) {
      return { zoneName, feeKobo, isPickup, address: null, landmark: null };
    }

    const address = input.address;
    if (address === null || address.length < DELIVERY_LIMITS.addressMin) {
      throw new BadRequestException({ field: "address", message: "Enter the delivery address" });
    }
    return { zoneName, feeKobo, isPickup, address, landmark: input.landmark };
  }

  /** Adds the order to the admin Refunds list, unless this payment is already on it. */
  private async openRefundCase(
    orderId: string,
    paymentReference: string | null,
    reason: string,
    amountKobo: number,
  ) {
    if (paymentReference === null) {
      // No payment reference to tell cases apart: one open case per order is enough.
      const open = await this.db
        .select({ id: refundCases.id })
        .from(refundCases)
        .where(and(eq(refundCases.orderId, orderId), isNull(refundCases.resolvedAt)));
      if (open.length > 0) {
        return;
      }
    }
    await this.db
      .insert(refundCases)
      .values({ orderId, paymentReference, reason, amountKobo })
      // "ON CONFLICT DO NOTHING": the same payment reference again is quietly skipped.
      .onConflictDoNothing({ target: refundCases.paymentReference });
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

/** 409 PAYOUT_ACCOUNT_REQUIRED unless the seller has a Paystack subaccount. */
async function assertHasPayoutAccount(tx: DbTransaction, sellerId: string | undefined) {
  if (!sellerId) {
    throw new Error("assertHasPayoutAccount needs a sellerId");
  }
  const rows = await tx
    .select({ subaccountCode: sellers.paystackSubaccountCode })
    .from(sellers)
    .where(eq(sellers.id, sellerId));
  const seller = rows[0];
  if (!seller || seller.subaccountCode === null) {
    throw new ConflictException({
      statusCode: 409,
      code: "PAYOUT_ACCOUNT_REQUIRED",
      message: "Add your bank account to start receiving payments",
    });
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
