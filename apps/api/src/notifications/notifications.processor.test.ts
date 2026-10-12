/**
 * Integration test of the WhatsApp sender against the dev Postgres + Redis (db 1).
 * WhatsApp itself is replaced by a recorder that keeps every message instead of sending it.
 *
 * The processor is built by hand (not registered as a provider), so no BullMQ worker starts
 * and takes other test files' queued jobs.
 */
import "reflect-metadata";
import { sellers } from "@gbam/db";
import type { SendTemplateInput, WhatsAppClient } from "@gbam/integrations";
import { formatNaira } from "@gbam/shared";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ENV, type Env } from "../env.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { OrdersService } from "../orders/orders.service.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { PaymentsService } from "../payments/payments.service.js";
import {
  addTestPayoutAccount,
  createTestProduct,
  createTestSeller,
  TEST_DELIVERY,
} from "../test-helpers.js";
import { WhatsAppMessagesService } from "../whatsapp/whatsapp-messages.service.js";
import { WhatsAppModule } from "../whatsapp/whatsapp.module.js";
import { NotificationsProcessor } from "./notifications.processor.js";
import type { NotificationJob } from "./notifications.queue.js";

process.loadEnvFile?.("../../.env");

/** Keeps every message the processor "sends". */
class RecordingWhatsApp implements WhatsAppClient {
  templates: SendTemplateInput[] = [];
  texts: { to: string; text: string }[] = [];

  async sendTemplate(input: SendTemplateInput) {
    this.templates.push(input);
    return { messageId: `recorded-${randomUUID()}` };
  }

  async sendText(to: string, text: string) {
    this.texts.push({ to, text });
    return { messageId: `recorded-text-${randomUUID()}` };
  }
}

describe("NotificationsProcessor (integration)", () => {
  let moduleRef: TestingModule;
  let processor: NotificationsProcessor;
  let orders: OrdersService;
  let db: Db;
  let env: Env;
  const whatsapp = new RecordingWhatsApp();
  let seller: Awaited<ReturnType<typeof createTestSeller>>;
  let variantId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, IntegrationsModule, OrdersModule, PaymentsModule, WhatsAppModule],
    }).compile();
    db = moduleRef.get(DB);
    env = moduleRef.get<Env>(ENV);
    orders = moduleRef.get(OrdersService);
    processor = new NotificationsProcessor(
      db,
      whatsapp,
      moduleRef.get(PaymentsService),
      moduleRef.get(WhatsAppMessagesService),
      env,
    );

    seller = await createTestSeller(db, "notify");
    await addTestPayoutAccount(db, seller.id);
    const created = await createTestProduct(db, seller.id, { name: "Small chops" });
    variantId = created.variant.id;
  });

  afterAll(async () => {
    await db.delete(sellers).where(eq(sellers.id, seller.id)); // cascades to everything
    await moduleRef.close();
  });

  beforeEach(() => {
    whatsapp.templates = [];
    whatsapp.texts = [];
  });

  /** Runs one job the way BullMQ would. */
  async function run(data: NotificationJob) {
    return processor.process({ id: "test-job", data } as Job<NotificationJob>);
  }

  async function placeOrder(phone: string) {
    return orders.createFromStorefront(seller.slug, {
      customer: { name: "Ada", phone },
      delivery: TEST_DELIVERY,
      items: [{ variantId, quantity: 1 }],
    });
  }

  it("alerts the seller on their own WhatsApp when a new order comes in", async () => {
    const order = await placeOrder("2348011112222");
    await run({ kind: "seller.new_order", orderId: order.id });

    expect(whatsapp.templates).toHaveLength(1);
    expect(whatsapp.templates[0]).toMatchObject({
      to: seller.whatsappPhone,
      template: "gbam_seller_new_order",
    });
    expect(whatsapp.templates[0]?.params).toEqual([
      order.code,
      formatNaira(order.totalKobo),
      "Ada",
      `${env.WEB_URL}/dashboard/orders/${order.id}`,
    ]);
  });

  it("reminds the seller about an order still waiting for them, and not once it's handled", async () => {
    const waiting = await placeOrder("2348011112223");
    await run({ kind: "seller.order_waiting", orderId: waiting.id });
    expect(whatsapp.templates[0]).toMatchObject({
      to: seller.whatsappPhone,
      template: "gbam_seller_order_waiting",
    });

    whatsapp.templates = [];
    const handled = await placeOrder("2348011112224");
    await orders.transition({ orderId: handled.id, to: "cancelled", actor: "system" });
    await run({ kind: "seller.order_waiting", orderId: handled.id });
    expect(whatsapp.templates).toHaveLength(0);
  });

  it("sends the customer no separate message when an order is marked delivered", async () => {
    const order = await placeOrder("2348011112225");
    await run({ kind: "order.status_changed", orderId: order.id, from: "fulfilled", to: "delivered" });
    expect(whatsapp.templates).toHaveLength(0);
  });

  it("customer messages link to the shop's own WhatsApp", async () => {
    const order = await placeOrder("2348011112226");
    await run({ kind: "order.status_changed", orderId: order.id, from: null, to: "cancelled" });
    expect(whatsapp.templates[0]).toMatchObject({
      to: "2348011112226",
      template: "gbam_order_cancelled",
    });
    expect(whatsapp.templates[0]?.params).toContain(`https://wa.me/${seller.whatsappPhone}`);
  });

  it("auto-replies to a customer who messages gbam, pointing to their shop", async () => {
    await placeOrder("2348011112227");
    await run({ kind: "customer.auto_reply", phone: "2348011112227" });
    expect(whatsapp.texts).toHaveLength(1);
    expect(whatsapp.texts[0]?.to).toBe("2348011112227");
    expect(whatsapp.texts[0]?.text).toContain(seller.businessName);
    expect(whatsapp.texts[0]?.text).toContain(`https://wa.me/${seller.whatsappPhone}`);
  });

  it("auto-replies with a general answer to someone who never ordered", async () => {
    await run({ kind: "customer.auto_reply", phone: "2349099998888" });
    expect(whatsapp.texts[0]?.text).toContain("Please message the shop you ordered from");
  });
});
