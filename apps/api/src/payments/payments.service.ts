import { orders, payments, sellers } from "@gbam/db";
import { calculatePlatformFee, InvalidOrderTransitionError, type OrderStatus } from "@gbam/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { ENV, type Env } from "../env.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { InjectPaystack, type PaystackClient } from "../integrations/integrations.module.js";
import { OrdersService } from "../orders/orders.service.js";

/** Statuses an order can only reach after it has been paid. */
const PAID_OR_LATER: OrderStatus[] = ["paid", "fulfilled", "delivered", "refunded"];

/** Paystack requires an email address, but our customers only give a phone number. */
function placeholderEmail(phone: string): string {
  return `${phone}@customers.gbam.app`;
}

/** Asked for a payment link, but the order has already moved past "awaiting payment". */
export class OrderNotAwaitingPaymentError extends Error {
  constructor(
    readonly orderId: string,
    readonly status: string,
  ) {
    super(`Order ${orderId} is ${status}, not awaiting payment`);
    this.name = "OrderNotAwaitingPaymentError";
  }
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    // `PaystackClient` is an interface: in dev this is the fake, in production the real one.
    @InjectPaystack() private readonly paystack: PaystackClient,
    @Inject(ENV) private readonly env: Env,
    private readonly orders: OrdersService,
  ) {}

  /**
   * Returns the Paystack checkout link for an order, creating it the first time.
   *
   * Safe to call more than once (e.g. when a job is retried): an existing link is reused.
   * The order row is locked while we work, so if two calls arrive at the same moment the
   * second one waits, then finds and reuses the link the first one created.
   */
  async ensurePaymentLink(orderId: string): Promise<{ url: string; reference: string }> {
    const link = await this.db.transaction(async (tx) => {
      // 1. Lock the order (see "row lock" in OrdersService.transition).
      const lockedRows = await tx
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update");
      const locked = lockedRows[0];
      if (!locked) {
        throw new Error(`Order ${orderId} not found`);
      }
      // Checked HERE, under the lock: if the customer paid a moment ago (webhook) the order is
      // no longer awaiting payment, and a new link would let them be charged twice.
      if (locked.status !== "awaiting_payment") {
        throw new OrderNotAwaitingPaymentError(orderId, locked.status);
      }
      // The shop's owner deleted their account: they can't send the goods or give money
      // back, so no new payments for it (old links, the /pay page, a queued WhatsApp).
      const shopRows = await tx
        .select({ closedAt: sellers.closedAt })
        .from(orders)
        .innerJoin(sellers, eq(sellers.id, orders.sellerId))
        .where(eq(orders.id, orderId));
      const shop = shopRows[0];
      if (shop && shop.closedAt !== null) {
        throw new OrderNotAwaitingPaymentError(orderId, "in a closed shop");
      }

      // 2. Already have an unpaid link for this order? Reuse it.
      const existingRows = await tx
        .select({ url: payments.authorizationUrl, reference: payments.reference })
        .from(payments)
        .where(
          and(
            eq(payments.orderId, orderId),
            eq(payments.status, "pending"),
            isNotNull(payments.authorizationUrl),
          ),
        )
        .orderBy(desc(payments.createdAt))
        .limit(1);
      const existing = existingRows[0];
      if (existing && existing.url) {
        return { url: existing.url, reference: existing.reference };
      }

      // 3. Otherwise ask Paystack for a new checkout link.
      const order = await tx.query.orders.findFirst({
        where: eq(orders.id, orderId),
        with: { customer: true, seller: true },
      });
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      // Our own unique id for this payment, e.g. "gbam_GB-7K3Q_9f2c41ab".
      const randomPart = randomBytes(4).toString("hex");
      const reference = `gbam_${order.code}_${randomPart}`;

      // gbam's cut for this order (1.5%, capped, or 0 for founding sellers). The rules
      // live in packages/shared/src/fees.ts.
      // Worked out on the items only (subtotal): Gbam takes no cut of the delivery fee.
      const platformFeeKobo = calculatePlatformFee(order.subtotalKobo, order.seller.feeWaivedUntil);

      // If the seller has a Paystack subaccount, Paystack pays them directly and keeps
      // our cut in our account. Without one, the whole amount lands in our account.
      let split: { subaccount: string; platformFeeKobo: number } | undefined = undefined;
      if (order.seller.paystackSubaccountCode) {
        split = { subaccount: order.seller.paystackSubaccountCode, platformFeeKobo };
      }

      // We call Paystack while still holding the lock, on purpose: creating the link is
      // the step that must not happen twice. The Paystack client gives up after 15s.
      const initialized = await this.paystack.initializeTransaction({
        reference,
        amountKobo: order.totalKobo,
        email: placeholderEmail(order.customer.phone),
        // Where Paystack sends the customer after paying.
        callbackUrl: `${this.env.WEB_URL}/${order.seller.slug}?paid=${order.code}`,
        split,
        metadata: { orderId, orderCode: order.code, sellerId: order.sellerId },
      });

      // 4. Save it. If Paystack had failed above, we'd never get here, and the
      //    transaction would leave no half-made payment row behind.
      await tx.insert(payments).values({
        orderId,
        reference,
        amountKobo: order.totalKobo,
        authorizationUrl: initialized.authorizationUrl,
        platformFeeKobo,
        status: "pending",
      });

      return { url: initialized.authorizationUrl, reference };
    });

    return link;
  }

  /**
   * Called by the worker after Paystack tells us (via webhook) that a payment succeeded.
   *
   * We never trust the webhook's content alone: we ask Paystack directly and check the
   * amount. This is also safe to run twice for the same payment ("idempotent"), because
   * Paystack can send the same webhook more than once.
   */
  async confirm(reference: string): Promise<"paid" | "ignored"> {
    const paymentRows = await this.db
      .select()
      .from(payments)
      .where(eq(payments.reference, reference));
    const payment = paymentRows[0];
    if (!payment) {
      this.logger.warn(`Webhook for unknown payment reference ${reference}; ignoring`);
      return "ignored";
    }

    // Ask Paystack directly what happened with this transaction.
    const verified = await this.paystack.verifyTransaction(reference);

    if (verified.status !== "success") {
      this.logger.warn(`Payment ${reference} verified as "${verified.status}", not success`);
      return "ignored";
    }

    const amountIsRight = verified.amountKobo === payment.amountKobo;
    const currencyIsRight = verified.currency === "NGN";
    if (!amountIsRight || !currencyIsRight) {
      // Wrong amount paid, or someone crafted a fake request. Never mark the order paid.
      this.logger.error(
        `AMOUNT MISMATCH on ${reference}: expected ${payment.amountKobo} NGN kobo, ` +
          `Paystack says ${verified.amountKobo} ${verified.currency}. Needs manual review.`,
      );
      await this.db
        .update(payments)
        .set({ status: "failed", raw: verified.raw })
        .where(eq(payments.id, payment.id));
      return "ignored";
    }

    await this.db
      .update(payments)
      .set({ status: "success", paystackFeeKobo: verified.paystackFeeKobo, raw: verified.raw })
      .where(eq(payments.id, payment.id));

    try {
      await this.orders.transition({ orderId: payment.orderId, to: "paid", actor: "system" });
    } catch (error) {
      if (!(error instanceof InvalidOrderTransitionError)) {
        // Something unexpected (e.g. database down). Rethrowing makes the job retry later.
        throw error;
      }

      // The state machine refused "→ paid". Why?
      const alreadyPaid = PAID_OR_LATER.includes(error.from);
      if (alreadyPaid) {
        // A duplicate webhook for an order we already marked paid. Nothing to do.
      } else {
        // e.g. the seller cancelled the order while the customer was paying.
        await this.logNeedsRefund(reference, payment.orderId, error.from);
      }
    }
    return "paid";
  }

  private async logNeedsRefund(reference: string, orderId: string, status: OrderStatus) {
    const sellerRows = await this.db
      .select({ slug: sellers.slug })
      .from(orders)
      .innerJoin(sellers, eq(sellers.id, orders.sellerId))
      .where(eq(orders.id, orderId));

    let store = "unknown store";
    if (sellerRows[0]) {
      store = sellerRows[0].slug;
    }

    this.logger.error(
      `Payment ${reference} succeeded but the order is "${status}" (store ${store}). NEEDS REFUND.`,
    );
    // The log is a backup; the email is what makes sure someone actually refunds them.
    await this.orders.emailSupportNeedsRefund(
      orderId,
      `The customer paid, but the order was already "${status}", so the money can't be kept.`,
      reference,
    );
  }
}
