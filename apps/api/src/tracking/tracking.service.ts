import { customers, orderEvents, orderIssues, orderItems, orders, sellers, users } from "@gbam/db";
import { ISSUE_REASON_LABEL, type ReportIssueInput, type TrackLookupInput } from "@gbam/shared";
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, like } from "drizzle-orm";
import { RateLimiter, TooManyRequestsError } from "../common/rate-limiter.js";
import { EmailQueue } from "../email/email.queue.js";
import { ENV, type Env } from "../env.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { accessCodeFrom } from "../payments/checkout-links.js";
import { OrderNotAwaitingPaymentError, PaymentsService } from "../payments/payments.service.js";

// One answer for every failed lookup, so nobody can tell "wrong code" from "wrong phone".
const NOT_FOUND = "We couldn't find an order with that code and phone number";

// Lookups per visitor IP per 15 minutes. Generous, because Nigerian mobile networks put many
// customers behind one IP address.
const LOOKUP_LIMIT = 30;
const LOOKUP_WINDOW_SECONDS = 15 * 60;

// Wrong guesses per order code per hour, from ANY IP: with the code known (e.g. from a
// screenshot) only 10,000 phone endings are possible, so this is what really stops guessing.
const CODE_MISS_LIMIT = 20;
const CODE_MISS_WINDOW_SECONDS = 60 * 60;

// Problem reports per order per hour.
const ISSUE_LIMIT = 3;
const ISSUE_WINDOW_SECONDS = 60 * 60;

/**
 * Order tracking for customers, who have no account. They prove it's their order with
 * either the secret key from their private link, or the order code + last 4 phone digits.
 */
@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly limiter: RateLimiter,
    private readonly payments: PaymentsService,
    private readonly emails: EmailQueue,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The /track form: code + last 4 digits of the ordering phone → the private link's key. */
  async lookup(visitorIp: string, input: TrackLookupInput) {
    const limit = await this.limiter.hit(
      `track-lookup:${visitorIp}`,
      LOOKUP_LIMIT,
      LOOKUP_WINDOW_SECONDS,
    );
    if (!limit.allowed) {
      throw new TooManyRequestsError(limit.retryAfterSeconds);
    }
    const codeKey = `track-lookup-code:${input.code}`;
    if ((await this.limiter.count(codeKey)) >= CODE_MISS_LIMIT) {
      throw new TooManyRequestsError(CODE_MISS_WINDOW_SECONDS);
    }
    // Codes are unique per shop only; with the phone digits as well, two matches are very
    // unlikely. If it happens, the newest order wins.
    const rows = await this.db
      .select({ code: orders.code, key: orders.trackingKey })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(and(eq(orders.code, input.code), like(customers.phone, `%${input.phoneLast4}`)))
      .orderBy(desc(orders.createdAt))
      .limit(1);
    const found = rows[0];
    if (!found) {
      // Only misses count towards the per-code limit.
      await this.limiter.hit(codeKey, CODE_MISS_LIMIT, CODE_MISS_WINDOW_SECONDS);
      throw new NotFoundException(NOT_FOUND);
    }
    return { code: found.code, key: found.key };
  }

  /** The order a private link points at. The key must match AND the code in the URL must too. */
  private async orderFor(code: string, key: string) {
    const rows = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.trackingKey, key), eq(orders.code, code.toUpperCase())));
    const order = rows[0];
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    return order;
  }

  /** What the customer's tracking page shows. No customer name/phone, no internal ids. */
  async view(code: string, key: string) {
    const order = await this.orderFor(code, key);
    const shopRows = await this.db
      .select({
        slug: sellers.slug,
        businessName: sellers.businessName,
        whatsappPhone: sellers.whatsappPhone,
        closedAt: sellers.closedAt,
        suspendedAt: sellers.suspendedAt,
        pickupNote: sellers.pickupNote,
      })
      .from(sellers)
      .where(eq(sellers.id, order.sellerId));
    const shopRow = shopRows[0];
    if (!shopRow) {
      throw new NotFoundException("Order not found");
    }
    const shop = {
      slug: shopRow.slug,
      businessName: shopRow.businessName,
      whatsappPhone: shopRow.whatsappPhone,
    };
    // A closed shop (owner deleted the account) takes no more payments.
    // ...and neither does a shop Gbam suspended.
    const shopOpen = shopRow.closedAt === null && shopRow.suspendedAt === null;
    const items = await this.db
      .select({
        productName: orderItems.productName,
        variantTitle: orderItems.variantTitle,
        unitPriceKobo: orderItems.unitPriceKobo,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    const events = await this.db
      .select({ toStatus: orderEvents.toStatus, createdAt: orderEvents.createdAt })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, order.id))
      .orderBy(asc(orderEvents.createdAt));
    const issueRows = await this.db
      .select({
        reason: orderIssues.reason,
        createdAt: orderIssues.createdAt,
        resolvedAt: orderIssues.resolvedAt,
      })
      .from(orderIssues)
      .where(eq(orderIssues.orderId, order.id))
      .orderBy(desc(orderIssues.createdAt));
    const issues = [];
    for (const issue of issueRows) {
      issues.push({
        reason: issue.reason,
        createdAt: issue.createdAt,
        resolved: issue.resolvedAt !== null,
      });
    }

    // The delivery choice, without the address: the address is personal, so only the seller
    // sees it. null for orders placed in a shop with no delivery zones.
    let delivery: { zoneName: string; isPickup: boolean; pickupNote: string | null } | null = null;
    if (order.deliveryZoneName !== null) {
      let pickupNote: string | null = null;
      if (order.deliveryIsPickup) {
        pickupNote = shopRow.pickupNote;
      }
      delivery = { zoneName: order.deliveryZoneName, isPickup: order.deliveryIsPickup, pickupNote };
    }

    return {
      shop,
      order: {
        code: order.code,
        status: order.status,
        subtotalKobo: order.subtotalKobo,
        deliveryFeeKobo: order.deliveryFeeKobo,
        totalKobo: order.totalKobo,
        delivery,
        createdAt: order.createdAt,
        items,
        events,
      },
      issues,
      canPay: order.status === "awaiting_payment" && shopOpen,
    };
  }

  /**
   * "Pay": the order's Paystack checkout, only while payment is awaited. `accessCode` lets
   * the /pay page open Paystack's pop-up; `url` is the fallback (Paystack's own page).
   */
  async payLink(code: string, key: string) {
    const order = await this.orderFor(code, key);
    if (order.status !== "awaiting_payment") {
      throw new ConflictException("This order isn't waiting for payment.");
    }
    try {
      const link = await this.payments.ensurePaymentLink(order.id);
      return { url: link.url, accessCode: accessCodeFrom(link.url) };
    } catch (error) {
      // It changed between our check and the lock (e.g. just paid): say so, don't charge twice.
      if (error instanceof OrderNotAwaitingPaymentError) {
        throw new ConflictException("This order isn't waiting for payment.");
      }
      throw error;
    }
  }

  /** "Report a problem": saved on the order, and the seller gets an email. */
  async reportIssue(code: string, key: string, input: ReportIssueInput) {
    const order = await this.orderFor(code, key);
    const limit = await this.limiter.hit(
      `track-issue:${order.id}`,
      ISSUE_LIMIT,
      ISSUE_WINDOW_SECONDS,
    );
    if (!limit.allowed) {
      throw new TooManyRequestsError(limit.retryAfterSeconds);
    }
    let note: string | null = null;
    if (input.note && input.note !== "") {
      note = input.note;
    }
    const inserted = await this.db
      .insert(orderIssues)
      .values({ orderId: order.id, reason: input.reason, note })
      .returning({ id: orderIssues.id });
    const issue = inserted[0];
    if (!issue) {
      throw new Error("Saving the problem report returned no row");
    }
    await this.emailSeller(order, issue.id, input.reason, note);
    return { ok: true };
  }

  private async emailSeller(
    order: { id: string; code: string; sellerId: string },
    issueId: string,
    reason: ReportIssueInput["reason"],
    note: string | null,
  ) {
    try {
      const rows = await this.db
        .select({ email: users.email, businessName: sellers.businessName })
        .from(sellers)
        .innerJoin(users, eq(users.id, sellers.ownerUserId))
        .where(eq(sellers.id, order.sellerId));
      const owner = rows[0];
      if (!owner) {
        // Old demo shops have no owner account; the problem still shows in the dashboard.
        return;
      }
      await this.emails.send(`issue-${issueId}`, {
        kind: "issue_reported",
        to: owner.email,
        shopName: owner.businessName,
        code: order.code,
        reasonLabel: ISSUE_REASON_LABEL[reason],
        note,
        orderUrl: `${this.env.WEB_URL}/dashboard/orders/${order.id}`,
      });
    } catch (error) {
      // The report is saved either way; a mail problem must not hide it from the customer.
      let message = "error";
      if (error instanceof Error) {
        message = error.message;
      }
      this.logger.error(`Could not email the seller about a problem on ${order.code}: ${message}`);
    }
  }
}
