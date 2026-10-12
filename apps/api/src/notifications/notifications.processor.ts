import { customers, orders, sellers } from "@gbam/db";
import { WhatsAppError, type WhatsAppTemplateName } from "@gbam/integrations";
import { formatNaira, type OrderStatus } from "@gbam/shared";
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { UnrecoverableError, type Job } from "bullmq";
import { desc, eq } from "drizzle-orm";
import { ENV, type Env } from "../env.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { InjectWhatsApp, type WhatsAppClient } from "../integrations/integrations.module.js";
import { payPageUrl } from "../payments/checkout-links.js";
import { OrderNotAwaitingPaymentError, PaymentsService } from "../payments/payments.service.js";
import { WhatsAppMessagesService } from "../whatsapp/whatsapp-messages.service.js";
import { autoReplyText, customerMessage, shopChatLink } from "./customer-messages.js";
import { NOTIFICATIONS_QUEUE, type NotificationJob } from "./notifications.queue.js";
import { reportJobFailure } from "../instrument.js";

// WhatsApp (Meta) error codes where trying again can never work.
const PERMANENT_WHATSAPP_ERRORS = [
  131026, // the recipient can't receive messages (e.g. not on WhatsApp)
  131030, // test number: recipient isn't on the app's allowed-recipients list
  132000, // wrong number of {{n}} values for the template
  132001, // template doesn't exist or isn't approved yet
];

/**
 * Runs in the WORKER process only. BullMQ calls `process()` once for every job in the
 * "notifications" queue. If it throws, BullMQ retries the job later (up to 5 times).
 *
 * `@Processor(...)` tells Nest which queue this class handles.
 */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    @InjectDb() private readonly db: Db,
    @InjectWhatsApp() private readonly whatsapp: WhatsAppClient,
    private readonly payments: PaymentsService,
    private readonly messages: WhatsAppMessagesService,
    @Inject(ENV) private readonly env: Env,
  ) {
    super(); // required because we extend WorkerHost
  }

  /** Tells Sentry when a job has failed for good (see reportJobFailure in instrument.ts). */
  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error) {
    reportJobFailure(job, error);
  }

  async process(job: Job<NotificationJob>) {
    const data = job.data;
    // Each kind of job is handled by its own method below.
    if (data.kind === "customer.auto_reply") {
      return this.sendAutoReply(data.phone);
    }
    if (data.kind === "seller.new_order" || data.kind === "seller.order_waiting") {
      return this.sendSellerAlert(data.kind, data.orderId);
    }
    return this.sendCustomerMessage(job.id, data.orderId, data.to);
  }

  /** The order with its customer and shop, or null if it was deleted meanwhile. */
  private async loadOrder(orderId: string) {
    const order = await this.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { customer: true, seller: true },
    });
    if (!order) {
      return null;
    }
    return order;
  }

  /** The customer's message for the status their order just moved to. */
  private async sendCustomerMessage(
    jobId: string | undefined,
    orderId: string,
    newStatus: OrderStatus,
  ) {
    const order = await this.loadOrder(orderId);
    if (order === null) {
      this.logger.warn(`Order ${orderId} no longer exists, dropping job ${jobId}`);
      return { skipped: true };
    }

    if (newStatus === "awaiting_payment") {
      // Create the Paystack checkout now (so the pay page opens fast), but send the customer
      // to OUR review-and-pay page, which shows what they're paying for before Paystack.
      try {
        await this.payments.ensurePaymentLink(orderId);
      } catch (error) {
        // The order moved on (paid or cancelled) before this message went out: a payment
        // request would now be wrong, so skip it instead of retrying.
        if (error instanceof OrderNotAwaitingPaymentError) {
          this.logger.log(`Skipping payment request for ${order.code}: order is ${error.status}`);
          return { skipped: true };
        }
        throw error;
      }
    }

    const message = customerMessage(newStatus, {
      store: order.seller.businessName,
      customerName: order.customer.name,
      code: order.code,
      total: formatNaira(order.totalKobo),
      payLink: payPageUrl(this.env.WEB_URL, order.code, order.trackingKey),
      shopChat: shopChatLink(order.seller.whatsappPhone),
    });
    if (message === null) {
      return { skipped: true };
    }
    return this.sendToCustomer(orderId, order.customer.phone, message.template, message.params);
  }

  /** WhatsApp alerts to the SELLER: a new order, or one still waiting for them to check. */
  private async sendSellerAlert(kind: "seller.new_order" | "seller.order_waiting", orderId: string) {
    const order = await this.loadOrder(orderId);
    if (order === null) {
      return { skipped: true };
    }
    const orderPage = `${this.env.WEB_URL}/dashboard/orders/${order.id}`;
    const total = formatNaira(order.totalKobo);

    if (kind === "seller.new_order") {
      return this.sendToSeller(order.seller.whatsappPhone, "gbam_seller_new_order", [
        order.code,
        total,
        order.customer.name,
        orderPage,
      ]);
    }

    // The 30-minute reminder: only if the seller still hasn't acted on the order.
    if (order.status !== "pending") {
      return { skipped: true };
    }
    return this.sendToSeller(order.seller.whatsappPhone, "gbam_seller_order_waiting", [
      order.code,
      total,
      orderPage,
    ]);
  }

  /**
   * A customer wrote to gbam's number. Nobody reads it, so we point them to the shop they
   * last ordered from. A plain text reply is allowed because they messaged us first.
   */
  private async sendAutoReply(phone: string) {
    const rows = await this.db
      .select({ store: sellers.businessName, sellerPhone: sellers.whatsappPhone })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .innerJoin(sellers, eq(sellers.id, orders.sellerId))
      .where(eq(customers.phone, phone))
      .orderBy(desc(orders.createdAt))
      .limit(1);
    const latest = rows[0];

    let shop: { store: string; shopChat: string } | null = null;
    if (latest) {
      shop = { store: latest.store, shopChat: shopChatLink(latest.sellerPhone) };
    }
    const sent = await this.whatsapp.sendText(phone, autoReplyText(shop));
    return { messageId: sent.messageId };
  }

  /**
   * Sends a template to a seller. Not saved in whatsapp_messages: that list holds the
   * customer's messages, shown on the seller's order page.
   */
  private async sendToSeller(to: string, template: WhatsAppTemplateName, params: string[]) {
    try {
      const sent = await this.whatsapp.sendTemplate({ to, template, params });
      return { messageId: sent.messageId, template };
    } catch (error) {
      if (error instanceof WhatsAppError && error.code !== undefined) {
        if (PERMANENT_WHATSAPP_ERRORS.includes(error.code)) {
          // UnrecoverableError tells BullMQ "don't retry": it would fail the same way again.
          throw new UnrecoverableError(`${template} to ${to}: ${error.message}`);
        }
      }
      // Probably temporary (network, Meta outage). Rethrow so BullMQ retries later.
      throw error;
    }
  }

  /** Sends a template to a customer and records it, so the seller can see what was sent. */
  private async sendToCustomer(
    orderId: string,
    to: string,
    template: WhatsAppTemplateName,
    params: string[],
  ) {
    try {
      const sent = await this.whatsapp.sendTemplate({ to, template, params });
      // Record it so the WhatsApp webhook can later mark it delivered / read / failed.
      await this.recordSafely(() =>
        this.messages.recordAccepted({ orderId, wamid: sent.messageId, template, toPhone: to }),
      );
      return { messageId: sent.messageId, template };
    } catch (error) {
      if (error instanceof WhatsAppError && error.code !== undefined) {
        const errorCode = error.code;
        const errorMessage = error.message;
        const isPermanent = PERMANENT_WHATSAPP_ERRORS.includes(errorCode);
        if (isPermanent) {
          // Show the seller why it failed (dashboard order page).
          await this.recordSafely(() =>
            this.messages.recordRejected({
              orderId,
              template,
              toPhone: to,
              errorCode,
              errorMessage,
            }),
          );
          // UnrecoverableError tells BullMQ "don't retry": it would fail the same way again.
          throw new UnrecoverableError(`${template} to ${to}: ${error.message}`);
        }
      }
      // Probably temporary (network, Meta outage). Rethrow so BullMQ retries later.
      throw error;
    }
  }

  /**
   * Saving the record must never make the job fail: a retry would SEND THE MESSAGE AGAIN
   * and the customer would get it twice. So if saving fails we only log it.
   */
  private async recordSafely(save: () => Promise<void>) {
    try {
      await save();
    } catch (error) {
      this.logger.error("Couldn't record WhatsApp message status", error);
    }
  }
}
