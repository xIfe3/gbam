import { orders } from "@gbam/db";
import { WhatsAppError, type WhatsAppTemplateName } from "@gbam/integrations";
import { formatNaira } from "@gbam/shared";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { UnrecoverableError, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { InjectWhatsApp, type WhatsAppClient } from "../integrations/integrations.module.js";
import { PaymentsService } from "../payments/payments.service.js";
import { WhatsAppMessagesService } from "../whatsapp/whatsapp-messages.service.js";
import { NOTIFICATIONS_QUEUE, type NotificationJob } from "./notifications.queue.js";

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
  ) {
    super(); // required because we extend WorkerHost
  }

  async process(job: Job<NotificationJob>) {
    const orderId = job.data.orderId;
    const newStatus = job.data.to;

    const order = await this.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { customer: true, seller: true },
    });
    if (!order) {
      this.logger.warn(`Order ${orderId} no longer exists, dropping job ${job.id}`);
      return { skipped: true };
    }

    const code = order.code;
    const total = formatNaira(order.totalKobo);
    const customerName = order.customer.name;
    const store = order.seller.businessName;

    // Pick the WhatsApp template for the status the order just moved to, and fill in
    // its {{1}}, {{2}}, ... values in order. (Template texts: WHATSAPP_TEMPLATES.)
    let template: WhatsAppTemplateName;
    let params: string[];
    switch (newStatus) {
      case "pending":
        template = "gbam_order_received";
        params = [customerName, store, code, total];
        break;
      case "awaiting_payment": {
        const link = await this.payments.ensurePaymentLink(orderId);
        template = "gbam_payment_request";
        params = [customerName, total, code, store, link.url];
        break;
      }
      case "paid":
        template = "gbam_order_paid";
        params = [total, code, store];
        break;
      case "fulfilled":
        template = "gbam_order_fulfilled";
        params = [code, store];
        break;
      case "delivered":
        template = "gbam_order_delivered";
        params = [code, store];
        break;
      case "cancelled":
        template = "gbam_order_cancelled";
        params = [code, store];
        break;
      case "refunded":
        template = "gbam_order_refunded";
        params = [code, store];
        break;
    }

    try {
      const sent = await this.whatsapp.sendTemplate({
        to: order.customer.phone,
        template,
        params,
      });
      // Record it so the WhatsApp webhook can later mark it delivered / read / failed.
      await this.recordSafely(() =>
        this.messages.recordAccepted({
          orderId,
          wamid: sent.messageId,
          template,
          toPhone: order.customer.phone,
        }),
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
              toPhone: order.customer.phone,
              errorCode,
              errorMessage,
            }),
          );
          // UnrecoverableError tells BullMQ "don't retry": it would fail the same way again.
          throw new UnrecoverableError(`${template} to ${order.customer.phone}: ${error.message}`);
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
