import {
  orderEvents,
  orders,
  payments,
  sellers,
  type DbTransaction,
  type PaymentInstructions,
} from "@gbam/db";
import {
  calculatePlatformFee,
  InvalidOrderTransitionError,
  type DirectPayChoice,
  type OrderStatus,
} from "@gbam/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, gt, isNotNull, max, ne } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { ENV, type Env } from "../env.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { PlatformSettingsService } from "../infra/platform-settings.service.js";
import { InjectPaystack, type PaystackClient } from "../integrations/integrations.module.js";
import { OrdersService } from "../orders/orders.service.js";

/** Statuses an order can only reach after it has been paid. */
const PAID_OR_LATER: OrderStatus[] = ["paid", "fulfilled", "delivered", "refunded"];

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
/** How long a transfer account or USSD code from our own pay screen lasts. */
const DIRECT_PAY_MINUTES = 30;
/**
 * Paystack's shortest transfer account lasts 15 minutes, plus a minute for the request. With
 * less time than this before the order is cancelled, we don't open one.
 */
const MIN_MINUTES_TO_PAY = 16;
/** An open account with less than this left isn't shown again: too little time to pay. */
const REUSE_MIN_MINUTES_LEFT = 5;

/**
 * Paystack requires an email address. Customers may leave theirs at checkout; if they
 * didn't, we make one from their phone number (nothing is ever sent to it).
 */
function emailForPaystack(customerEmail: string | null, phone: string): string {
  if (customerEmail && customerEmail !== "") {
    return customerEmail;
  }
  return `${phone}@customers.gbam.app`;
}

/** Our own unique id for a payment, e.g. "gbam_GB-7K3Q_9f2c41ab". */
function newReference(orderCode: string): string {
  const randomPart = randomBytes(4).toString("hex");
  return `gbam_${orderCode}_${randomPart}`;
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

/** The order is cancelled for non-payment too soon for a transfer or USSD payment to finish. */
export class NotEnoughTimeToPayError extends Error {
  constructor(readonly orderId: string) {
    super(`Order ${orderId} is cancelled too soon to pay by transfer or USSD`);
    this.name = "NotEnoughTimeToPayError";
  }
}

/** What our own pay screen shows: where to send the money, or the code to dial. */
export type DirectPayment =
  | {
      method: "bank_transfer";
      reference: string;
      amountKobo: number;
      expiresAt: Date;
      bankName: string;
      accountNumber: string;
      accountName: string;
    }
  | {
      method: "ussd";
      reference: string;
      amountKobo: number;
      expiresAt: Date;
      bank: string;
      ussdCode: string;
    };

type PaymentRow = typeof payments.$inferSelect;

/** A saved transfer/USSD payment row → what the pay screen shows. */
function toDirectPayment(row: PaymentRow): DirectPayment {
  const instructions = row.instructions;
  const expiresAt = row.expiresAt;
  if (!instructions || !expiresAt) {
    throw new Error(`Payment ${row.reference} has no transfer or USSD details`);
  }
  if (instructions.kind === "bank_transfer") {
    return {
      method: "bank_transfer",
      reference: row.reference,
      amountKobo: row.amountKobo,
      expiresAt,
      bankName: instructions.bankName,
      accountNumber: instructions.accountNumber,
      accountName: instructions.accountName,
    };
  }
  return {
    method: "ussd",
    reference: row.reference,
    amountKobo: row.amountKobo,
    expiresAt,
    bank: instructions.bank,
    ussdCode: instructions.ussdCode,
  };
}

/** Is this saved payment the one the customer is asking for again (same method and bank)? */
function sameChoice(row: PaymentRow, choice: DirectPayChoice): boolean {
  const instructions = row.instructions;
  if (!instructions) {
    return false;
  }
  if (choice.method === "bank_transfer") {
    return instructions.kind === "bank_transfer";
  }
  return instructions.kind === "ussd" && instructions.bank === choice.bank;
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
    private readonly platform: PlatformSettingsService,
  ) {}

  /**
   * Locks the order row and checks it can still be paid. Every way of starting a payment
   * calls this first, inside its transaction.
   *
   * The lock ("row lock", see OrdersService.transition) makes a second call for the same
   * order wait until the first one is finished, so two taps never open two payments.
   */
  private async lockPayableOrder(tx: DbTransaction, orderId: string): Promise<void> {
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
    // no longer awaiting payment, and a new payment would let them be charged twice.
    if (locked.status !== "awaiting_payment") {
      throw new OrderNotAwaitingPaymentError(orderId, locked.status);
    }
    // The shop's owner deleted their account: they can't send the goods or give money
    // back, so no new payments for it (old links, the /pay page, a queued WhatsApp).
    // A shop Gbam suspended takes no payments either, until it's reopened.
    const shopRows = await tx
      .select({ closedAt: sellers.closedAt, suspendedAt: sellers.suspendedAt })
      .from(orders)
      .innerJoin(sellers, eq(sellers.id, orders.sellerId))
      .where(eq(orders.id, orderId));
    const shop = shopRows[0];
    if (shop && shop.closedAt !== null) {
      throw new OrderNotAwaitingPaymentError(orderId, "in a closed shop");
    }
    if (shop && shop.suspendedAt !== null) {
      throw new OrderNotAwaitingPaymentError(orderId, "in a suspended shop");
    }
  }

  /** Everything Paystack needs to charge this order, the same for every way of paying. */
  private async chargeDetails(tx: DbTransaction, orderId: string) {
    const order = await tx.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { customer: true, seller: true },
    });
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    // gbam's cut for this order (1.5%, capped, or 0 for founding sellers). The rules
    // live in packages/shared/src/fees.ts.
    // Worked out on the items only (subtotal): Gbam takes no cut of the delivery fee.
    // The rates in force now (Admin → Settings). The fee is stored on the payment, so a
    // later change never alters a payment that already exists.
    const settings = await this.platform.get();
    const platformFeeKobo = calculatePlatformFee(
      order.subtotalKobo,
      order.seller.feeWaivedUntil,
      new Date(),
      { percentBasisPoints: settings.feePercentBasisPoints, capKobo: settings.feeCapKobo },
    );

    // If the seller has a Paystack subaccount, Paystack pays them directly and keeps
    // our cut in our account. Without one, the whole amount lands in our account.
    let split: { subaccount: string; platformFeeKobo: number } | undefined = undefined;
    if (order.seller.paystackSubaccountCode) {
      split = { subaccount: order.seller.paystackSubaccountCode, platformFeeKobo };
    }

    return {
      order,
      platformFeeKobo,
      split,
      email: emailForPaystack(order.customerEmail, order.customer.phone),
      metadata: { orderId, orderCode: order.code, sellerId: order.sellerId },
    };
  }

  /**
   * When the order will be cancelled for not being paid (Admin → Settings decides how
   * long), counted from when it was last moved to awaiting payment. null if we can't tell.
   */
  private async cancelledForNonPaymentAt(tx: DbTransaction, orderId: string): Promise<Date | null> {
    // max(): the newest "moved to awaiting_payment" time for this order.
    const rows = await tx
      .select({ askedAt: max(orderEvents.createdAt) })
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, orderId), eq(orderEvents.toStatus, "awaiting_payment")));
    const askedAt = rows[0]?.askedAt;
    if (!askedAt) {
      return null;
    }
    const settings = await this.platform.get();
    return new Date(askedAt.getTime() + settings.cancelAfterHours * HOUR_MS);
  }

  /**
   * Returns the Paystack checkout link for an order, creating it the first time.
   *
   * Safe to call more than once (e.g. when a job is retried): an existing link is reused.
   * The order row is locked while we work, so if two calls arrive at the same moment the
   * second one waits, then finds and reuses the link the first one created.
   */
  async ensurePaymentLink(orderId: string): Promise<{ url: string; reference: string }> {
    const link = await this.db.transaction(async (tx) => {
      // 1. Lock the order and check it can still be paid.
      await this.lockPayableOrder(tx, orderId);

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
      const charge = await this.chargeDetails(tx, orderId);
      const reference = newReference(charge.order.code);

      // We call Paystack while still holding the lock, on purpose: creating the link is
      // the step that must not happen twice. The Paystack client gives up after 15s.
      const initialized = await this.paystack.initializeTransaction({
        reference,
        amountKobo: charge.order.totalKobo,
        email: charge.email,
        // Where Paystack sends the customer after paying.
        callbackUrl: `${this.env.WEB_URL}/${charge.order.seller.slug}?paid=${charge.order.code}`,
        split: charge.split,
        metadata: charge.metadata,
      });

      // 4. Save it. If Paystack had failed above, we'd never get here, and the
      //    transaction would leave no half-made payment row behind.
      await tx.insert(payments).values({
        orderId,
        reference,
        amountKobo: charge.order.totalKobo,
        authorizationUrl: initialized.authorizationUrl,
        platformFeeKobo: charge.platformFeeKobo,
        status: "pending",
      });

      return { url: initialized.authorizationUrl, reference };
    });

    return link;
  }

  /**
   * "Pay by transfer" or "Pay by USSD" on gbam's own pay screen: asks Paystack for a
   * one-off account (or a USSD code) for this order and saves it.
   *
   * Asking again for the same thing (a reload, a second tap) shows the same account while
   * it has a few minutes left. The account never lasts longer than the order: it stops
   * when the order would be cancelled for non-payment. The money arrives through the same
   * Paystack webhook as a card payment (see confirm()), found by its reference.
   */
  async startDirectPayment(orderId: string, choice: DirectPayChoice): Promise<DirectPayment> {
    const started = await this.db.transaction(async (tx) => {
      // 1. Lock the order and check it can still be paid.
      await this.lockPayableOrder(tx, orderId);
      const now = Date.now();

      // 2. The same method (and bank) already open, with time left? Show it again.
      const openRows = await tx
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.orderId, orderId),
            eq(payments.status, "pending"),
            eq(payments.method, choice.method),
            gt(payments.expiresAt, new Date(now + REUSE_MIN_MINUTES_LEFT * MINUTE_MS)),
          ),
        )
        .orderBy(desc(payments.createdAt));
      for (const row of openRows) {
        if (sameChoice(row, choice)) {
          return toDirectPayment(row);
        }
      }

      // 3. How long it can last: 30 minutes, but never past the order's cancellation.
      let expiresAt = new Date(now + DIRECT_PAY_MINUTES * MINUTE_MS);
      const cancelAt = await this.cancelledForNonPaymentAt(tx, orderId);
      if (cancelAt && cancelAt.getTime() < expiresAt.getTime()) {
        expiresAt = cancelAt;
      }
      if (expiresAt.getTime() - now < MIN_MINUTES_TO_PAY * MINUTE_MS) {
        throw new NotEnoughTimeToPayError(orderId);
      }

      // 4. Ask Paystack, still holding the lock (so it happens once).
      const charge = await this.chargeDetails(tx, orderId);
      const reference = newReference(charge.order.code);
      const input = {
        reference,
        amountKobo: charge.order.totalKobo,
        email: charge.email,
        split: charge.split,
        metadata: charge.metadata,
      };
      let instructions: PaymentInstructions;
      if (choice.method === "bank_transfer") {
        const account = await this.paystack.chargeBankTransfer({ ...input, expiresAt });
        instructions = {
          kind: "bank_transfer",
          bankName: account.bankName,
          accountNumber: account.accountNumber,
          accountName: account.accountName,
        };
        // Paystack may round the time a little. Use its time if it's earlier, but never a
        // later one: the account must not outlive the order.
        if (account.expiresAt.getTime() < expiresAt.getTime()) {
          expiresAt = account.expiresAt;
        }
      } else {
        const ussd = await this.paystack.chargeUssd({ ...input, bankType: choice.bank });
        instructions = { kind: "ussd", bank: choice.bank, ussdCode: ussd.ussdCode };
      }

      // 5. Save it, so a reload shows the same one and the webhook can find it.
      const inserted = await tx
        .insert(payments)
        .values({
          orderId,
          reference,
          amountKobo: charge.order.totalKobo,
          platformFeeKobo: charge.platformFeeKobo,
          status: "pending",
          method: choice.method,
          instructions,
          expiresAt,
        })
        .returning();
      const row = inserted[0];
      if (!row) {
        throw new Error(`Could not save payment ${reference}`);
      }
      return toDirectPayment(row);
    });

    return started;
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

    // Mark it successful, but only if it wasn't already: `returning` tells us whether this
    // run was the first to confirm it. A repeat of the same webhook gets nothing back.
    const newlyConfirmed = await this.db
      .update(payments)
      .set({ status: "success", paystackFeeKobo: verified.paystackFeeKobo, raw: verified.raw })
      .where(and(eq(payments.id, payment.id), ne(payments.status, "success")))
      .returning({ id: payments.id });
    const firstTimeConfirmed = newlyConfirmed.length > 0;

    try {
      await this.orders.transition({ orderId: payment.orderId, to: "paid", actor: "system" });
    } catch (error) {
      if (!(error instanceof InvalidOrderTransitionError)) {
        // Something unexpected (e.g. database down). Rethrowing makes the job retry later.
        throw error;
      }

      // The state machine refused "→ paid". Why?
      const alreadyPaid = PAID_OR_LATER.includes(error.from);
      if (alreadyPaid && !firstTimeConfirmed) {
        // A repeat of this same payment's webhook. Nothing to do.
      } else if (alreadyPaid) {
        // A DIFFERENT payment already paid this order (an order can have a card link, a
        // transfer account and USSD codes open at once): the customer paid twice.
        await this.logNeedsRefund(
          reference,
          payment.orderId,
          `The customer paid twice: the order was already "${error.from}" from another payment, so this one has to go back.`,
        );
      } else {
        // e.g. the seller cancelled the order while the customer was paying.
        await this.logNeedsRefund(
          reference,
          payment.orderId,
          `The customer paid, but the order was already "${error.from}", so the money can't be kept.`,
        );
      }
    }
    return "paid";
  }

  private async logNeedsRefund(reference: string, orderId: string, reason: string) {
    const sellerRows = await this.db
      .select({ slug: sellers.slug })
      .from(orders)
      .innerJoin(sellers, eq(sellers.id, orders.sellerId))
      .where(eq(orders.id, orderId));

    let store = "unknown store";
    if (sellerRows[0]) {
      store = sellerRows[0].slug;
    }

    this.logger.error(`Payment ${reference} (store ${store}): ${reason} NEEDS REFUND.`);
    // The log is a backup; the email is what makes sure someone actually refunds them.
    await this.orders.emailSupportNeedsRefund(orderId, reason, reference);
  }
}
