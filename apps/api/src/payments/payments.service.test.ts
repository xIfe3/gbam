/**
 * Integration test against the dev Postgres + Redis, with Paystack replaced by a stub
 * whose verify() result each test controls.
 */
import "reflect-metadata";
import { deliveryZones, orderEvents, orders, payments, sellers } from "@gbam/db";
import { calculatePlatformFee } from "@gbam/shared";
import type {
  Bank,
  BankTransferChargeInput,
  InitializeTransactionInput,
  UssdChargeInput,
  PaystackClient,
  VerifiedTransaction,
} from "@gbam/integrations";
import { Test, type TestingModule } from "@nestjs/testing";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { createTestProduct, createTestSeller, TEST_DELIVERY } from "../test-helpers.js";
import { IntegrationsModule, PAYSTACK } from "../integrations/integrations.module.js";
import { OrdersService } from "../orders/orders.service.js";
import { PaymentsModule } from "./payments.module.js";
import { PlatformSettingsService } from "../infra/platform-settings.service.js";
import {
  NotEnoughTimeToPayError,
  OrderNotAwaitingPaymentError,
  PaymentsService,
} from "./payments.service.js";

process.loadEnvFile?.("../../.env");

const SUBACCOUNT = "ACCT_test123";

class StubPaystack implements PaystackClient {
  initialized = 0;
  lastInitialize: InitializeTransactionInput | undefined = undefined;
  verifyResult: (reference: string) => Partial<VerifiedTransaction> = () => ({});
  amounts = new Map<string, number>();
  charges = 0;
  lastTransfer: BankTransferChargeInput | undefined = undefined;
  lastUssd: UssdChargeInput | undefined = undefined;

  async chargeBankTransfer(input: BankTransferChargeInput) {
    this.charges++;
    this.lastTransfer = input;
    this.amounts.set(input.reference, input.amountKobo);
    return {
      reference: input.reference,
      bankName: "Wema Bank",
      accountNumber: "1260367879",
      accountName: "PAYSTACK CHECKOUT",
      expiresAt: input.expiresAt,
    };
  }

  async chargeUssd(input: UssdChargeInput) {
    this.charges++;
    this.lastUssd = input;
    this.amounts.set(input.reference, input.amountKobo);
    return { reference: input.reference, ussdCode: "*" + input.bankType + "*33*4*26945#" };
  }

  async initializeTransaction(input: InitializeTransactionInput) {
    this.initialized++;
    this.lastInitialize = input;
    this.amounts.set(input.reference, input.amountKobo);
    return { authorizationUrl: `https://pay.test/${input.reference}`, reference: input.reference };
  }

  async verifyTransaction(reference: string) {
    return {
      reference,
      status: "success",
      amountKobo: this.amounts.get(reference) ?? 0,
      currency: "NGN",
      paystackFeeKobo: 1_500,
      raw: {},
      ...this.verifyResult(reference),
    };
  }

  // Payout setup isn't part of these tests.
  async listBanks(): Promise<Bank[]> {
    throw new Error("not used in payments tests");
  }

  async resolveAccount(): Promise<{ accountName: string }> {
    throw new Error("not used in payments tests");
  }

  async createSubaccount(): Promise<{ subaccountCode: string }> {
    throw new Error("not used in payments tests");
  }

  async updateSubaccount(): Promise<void> {
    throw new Error("not used in payments tests");
  }
}

describe("PaymentsService (integration)", () => {
  let moduleRef: TestingModule;
  let service: PaymentsService;
  let ordersService: OrdersService;
  let db: Db;
  let paystack: StubPaystack;
  let platform: PlatformSettingsService;
  let sellerId: string;
  let slug: string;
  let variantId: string;

  beforeAll(async () => {
    paystack = new StubPaystack();
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, IntegrationsModule, PaymentsModule],
    })
      .overrideProvider(PAYSTACK)
      .useValue(paystack)
      .compile();
    moduleRef.enableShutdownHooks();
    service = moduleRef.get(PaymentsService);
    ordersService = moduleRef.get(OrdersService);
    platform = moduleRef.get(PlatformSettingsService);
    db = moduleRef.get(DB);

    const seller = await createTestSeller(db, "pay");
    slug = seller.slug;
    sellerId = seller.id;
    // A seller can only request payment once they have a payout account (subaccount).
    await db
      .update(sellers)
      .set({ paystackSubaccountCode: SUBACCOUNT })
      .where(eq(sellers.id, sellerId));
    const created = await createTestProduct(db, sellerId, { name: "Puff-puff", priceKobo: 50_000 });
    variantId = created.variant.id;
  });

  afterAll(async () => {
    await db.delete(sellers).where(eq(sellers.id, sellerId));
    await moduleRef.close();
  });

  /** A fresh order the seller has moved to awaiting_payment. */
  async function orderMovedToAwaitingPayment() {
    const order = await ordersService.createFromStorefront(slug, {
      customer: { name: "Bisi", phone: "2348022223333" },
      delivery: TEST_DELIVERY,
      items: [{ variantId, quantity: 2 }],
    });
    await ordersService.transition({
      orderId: order.id,
      to: "awaiting_payment",
      actor: "seller",
      sellerId,
    });
    return order;
  }

  /** A fresh order moved to awaiting_payment, plus its payment link. */
  async function orderAwaitingPayment() {
    const order = await orderMovedToAwaitingPayment();
    const link = await service.ensurePaymentLink(order.id);
    return { order, link };
  }

  const statusOf = async (orderId: string) =>
    (await db.select({ s: orders.status }).from(orders).where(eq(orders.id, orderId)))[0]!.s;

  it("creates one payment link per order and reuses it", async () => {
    const before = paystack.initialized;
    const { order, link } = await orderAwaitingPayment();
    const again = await service.ensurePaymentLink(order.id);

    expect(again).toEqual(link);
    expect(paystack.initialized - before).toBe(1);
    expect(link.reference).toMatch(new RegExp(`^gbam_${order.code}_[0-9a-f]{8}$`));
  });

  it("refuses a new link once the order is no longer awaiting payment (no double charge)", async () => {
    const order = await orderMovedToAwaitingPayment();
    // e.g. the customer already paid through the WhatsApp link a moment ago.
    await db.update(orders).set({ status: "paid" }).where(eq(orders.id, order.id));
    await expect(service.ensurePaymentLink(order.id)).rejects.toBeInstanceOf(
      OrderNotAwaitingPaymentError,
    );
  });

  it("refuses a link (even an existing one) once the shop is closed", async () => {
    const { order } = await orderAwaitingPayment();
    await db.update(sellers).set({ closedAt: new Date() }).where(eq(sellers.id, order.sellerId));
    try {
      await expect(service.ensurePaymentLink(order.id)).rejects.toBeInstanceOf(
        OrderNotAwaitingPaymentError,
      );
    } finally {
      // The other tests in this file share this shop.
      await db.update(sellers).set({ closedAt: null }).where(eq(sellers.id, order.sellerId));
    }
  });

  it("creates only one link when two calls race", async () => {
    // Links are only made for orders awaiting payment (the real flow).
    const order = await orderMovedToAwaitingPayment();
    const before = paystack.initialized;
    const [a, b] = await Promise.all([
      service.ensurePaymentLink(order.id),
      service.ensurePaymentLink(order.id),
    ]);
    expect(a).toEqual(b);
    expect(paystack.initialized - before).toBe(1);
  });

  it("marks the order paid, and treats a duplicate webhook as a no-op", async () => {
    const { order, link } = await orderAwaitingPayment();

    expect(await service.confirm(link.reference)).toBe("paid");
    expect(await statusOf(order.id)).toBe("paid");
    expect(await service.confirm(link.reference)).toBe("paid"); // Paystack retry
    expect(await statusOf(order.id)).toBe("paid");

    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.reference, link.reference));
    expect(payment!.status).toBe("success");
  });

  it("never marks paid when Paystack reports a different amount", async () => {
    const { order, link } = await orderAwaitingPayment();
    paystack.verifyResult = () => ({ amountKobo: 100 }); // paid ₦1 instead of ₦1,000

    expect(await service.confirm(link.reference)).toBe("ignored");
    expect(await statusOf(order.id)).toBe("awaiting_payment");
    paystack.verifyResult = () => ({});
  });

  it("ignores transactions Paystack says aren't successful, and unknown references", async () => {
    const { order, link } = await orderAwaitingPayment();
    paystack.verifyResult = () => ({ status: "abandoned" });
    expect(await service.confirm(link.reference)).toBe("ignored");
    expect(await statusOf(order.id)).toBe("awaiting_payment");
    paystack.verifyResult = () => ({});

    expect(await service.confirm("gbam_GB-NOPE_00000000")).toBe("ignored");
  });

  it("doesn't throw (or retry forever) when a cancelled order gets paid", async () => {
    const { order, link } = await orderAwaitingPayment();
    await ordersService.transition({
      orderId: order.id,
      to: "cancelled",
      actor: "seller",
      sellerId,
    });

    // Logged as NEEDS REFUND; the order stays cancelled.
    expect(await service.confirm(link.reference)).toBe("paid");
    expect(await statusOf(order.id)).toBe("cancelled");
  });

  describe("gbam fee and Paystack split", () => {
    // Each order is 2 × ₦500 = ₦1,000 (100,000 kobo), so 1.5% = 1,500 kobo (₦15).
    const setSeller = (values: {
      paystackSubaccountCode?: string | null;
      feeWaivedUntil?: Date | null;
    }) => db.update(sellers).set(values).where(eq(sellers.id, sellerId));

    const paymentFor = async (reference: string) => {
      const rows = await db.select().from(payments).where(eq(payments.reference, reference));
      return rows[0];
    };

    it("records the fee but sends no split when the seller has no subaccount", async () => {
      // Sellers can't request payment without a subaccount any more, but an order that was
      // already awaiting payment (e.g. from before that rule) still gets a link, unsplit.
      const order = await orderMovedToAwaitingPayment();
      await setSeller({ paystackSubaccountCode: null, feeWaivedUntil: null });
      try {
        const link = await service.ensurePaymentLink(order.id);

        expect(paystack.lastInitialize?.split).toBeUndefined();
        expect((await paymentFor(link.reference))?.platformFeeKobo).toBe(1_500);
      } finally {
        await setSeller({ paystackSubaccountCode: SUBACCOUNT });
      }
    });

    it("splits to the seller, keeps 1.5%, and stores Paystack's real fee once paid", async () => {
      await setSeller({ paystackSubaccountCode: SUBACCOUNT, feeWaivedUntil: null });
      const { link } = await orderAwaitingPayment();
      expect(paystack.lastInitialize?.split).toEqual({
        subaccount: SUBACCOUNT,
        platformFeeKobo: 1_500,
      });

      await service.confirm(link.reference);
      const payment = await paymentFor(link.reference);
      expect(payment?.platformFeeKobo).toBe(1_500);
      expect(payment?.paystackFeeKobo).toBe(1_500); // from the stub's verify()
    });

    it("charges founding sellers nothing while their waiver lasts", async () => {
      const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      await setSeller({ paystackSubaccountCode: SUBACCOUNT, feeWaivedUntil: nextYear });
      try {
        const { link } = await orderAwaitingPayment();
        expect(paystack.lastInitialize?.split?.platformFeeKobo).toBe(0);
        expect((await paymentFor(link.reference))?.platformFeeKobo).toBe(0);
      } finally {
        await setSeller({ paystackSubaccountCode: SUBACCOUNT, feeWaivedUntil: null });
      }
    });
  });
  it("platform fee is calculated on the subtotal only", async () => {
    // A far-away zone with a big fee, so a fee taken on the whole total would be different.
    const zoneRows = await db
      .insert(deliveryZones)
      .values({ sellerId, name: "Far away", feeKobo: 5_000_000 })
      .returning();
    const zone = zoneRows[0];
    if (!zone) {
      throw new Error("expected a zone");
    }
    try {
      const order = await ordersService.createFromStorefront(slug, {
        customer: { name: "Bisi", phone: "2348022223333" },
        items: [{ variantId, quantity: 2 }],
        delivery: {
          zoneId: zone.id,
          expectedFeeKobo: 5_000_000,
          address: "1 Test Road",
          landmark: null,
        },
      });
      await ordersService.transition({
        orderId: order.id,
        to: "awaiting_payment",
        actor: "seller",
        sellerId,
      });
      await service.ensurePaymentLink(order.id);

      const paymentRows = await db.select().from(payments).where(eq(payments.orderId, order.id));
      const payment = paymentRows[0];
      // Paystack charges items + delivery...
      expect(payment?.amountKobo).toBe(5_100_000);
      // ...but Gbam's cut is worked out on the ₦1,000 of items only.
      expect(payment?.platformFeeKobo).toBe(calculatePlatformFee(100_000, null));
    } finally {
      // Other tests here place orders with no zone, which is refused while a zone exists.
      await db.delete(deliveryZones).where(eq(deliveryZones.id, zone.id));
    }
  });

  describe("gbam's own pay screens (transfer and USSD)", () => {
    const MINUTE = 60_000;

    /** Pretends the order was moved to awaiting payment `minutesAgo` minutes ago. */
    async function askedForPaymentAgo(orderId: string, minutesAgo: number) {
      await db
        .update(orderEvents)
        .set({ createdAt: new Date(Date.now() - minutesAgo * MINUTE) })
        .where(and(eq(orderEvents.orderId, orderId), eq(orderEvents.toStatus, "awaiting_payment")));
    }

    it("transfer: one account per order, shown again on a reload, saved with its expiry", async () => {
      const order = await orderMovedToAwaitingPayment();
      const before = paystack.charges;
      const first = await service.startDirectPayment(order.id, { method: "bank_transfer" });
      const again = await service.startDirectPayment(order.id, { method: "bank_transfer" });

      expect(paystack.charges - before).toBe(1);
      expect(again).toEqual(first);
      expect(first).toMatchObject({
        method: "bank_transfer",
        amountKobo: 100_000,
        bankName: "Wema Bank",
        accountNumber: "1260367879",
        accountName: "PAYSTACK CHECKOUT",
      });
      expect(first.reference).toMatch(new RegExp(`^gbam_${order.code}_[0-9a-f]{8}$`));
      // 30 minutes to pay.
      const minutesLeft = (first.expiresAt.getTime() - Date.now()) / MINUTE;
      expect(minutesLeft).toBeGreaterThan(29);
      expect(minutesLeft).toBeLessThanOrEqual(30);
      // The same split as a card checkout: the seller's subaccount, gbam keeps 1.5%.
      expect(paystack.lastTransfer?.split).toEqual({
        subaccount: SUBACCOUNT,
        platformFeeKobo: 1_500,
      });

      const rows = await db.select().from(payments).where(eq(payments.reference, first.reference));
      expect(rows[0]).toMatchObject({
        method: "bank_transfer",
        status: "pending",
        authorizationUrl: null,
        platformFeeKobo: 1_500,
        instructions: {
          kind: "bank_transfer",
          bankName: "Wema Bank",
          accountNumber: "1260367879",
          accountName: "PAYSTACK CHECKOUT",
        },
      });

      // The card pop-up still gets its own checkout link (not the transfer).
      const link = await service.ensurePaymentLink(order.id);
      expect(link.reference).not.toBe(first.reference);
    });

    it("a transfer is confirmed by the usual webhook, like a card payment", async () => {
      const order = await orderMovedToAwaitingPayment();
      const transfer = await service.startDirectPayment(order.id, { method: "bank_transfer" });
      expect(await service.confirm(transfer.reference)).toBe("paid");
      expect(await statusOf(order.id)).toBe("paid");
    });

    it("USSD: a code per bank, reused for the same bank, new for another", async () => {
      const order = await orderMovedToAwaitingPayment();
      const before = paystack.charges;
      const gtb = await service.startDirectPayment(order.id, { method: "ussd", bank: "737" });
      const gtbAgain = await service.startDirectPayment(order.id, { method: "ussd", bank: "737" });
      const zenith = await service.startDirectPayment(order.id, { method: "ussd", bank: "966" });

      expect(gtbAgain).toEqual(gtb);
      expect(zenith.reference).not.toBe(gtb.reference);
      expect(paystack.charges - before).toBe(2);
      expect(gtb).toMatchObject({ method: "ussd", bank: "737", ussdCode: "*737*33*4*26945#" });
      expect(paystack.lastUssd?.bankType).toBe("966");
    });

    it("an account close to expiring is replaced by a fresh one", async () => {
      const order = await orderMovedToAwaitingPayment();
      const first = await service.startDirectPayment(order.id, { method: "bank_transfer" });
      // Only 2 minutes left on it: too little to finish a transfer.
      await db
        .update(payments)
        .set({ expiresAt: new Date(Date.now() + 2 * MINUTE) })
        .where(eq(payments.reference, first.reference));
      const second = await service.startDirectPayment(order.id, { method: "bank_transfer" });
      expect(second.reference).not.toBe(first.reference);
    });

    it("the account never outlives the order, and isn't offered when time is nearly up", async () => {
      const settings = await platform.get();
      const order = await orderMovedToAwaitingPayment();
      // The order gets cancelled in 20 minutes.
      await askedForPaymentAgo(order.id, settings.cancelAfterHours * 60 - 20);
      const transfer = await service.startDirectPayment(order.id, { method: "bank_transfer" });
      const minutesLeft = (transfer.expiresAt.getTime() - Date.now()) / MINUTE;
      expect(minutesLeft).toBeGreaterThan(18);
      expect(minutesLeft).toBeLessThanOrEqual(20);

      // 10 minutes left: Paystack's shortest account lasts 15, so it would outlive the order.
      const late = await orderMovedToAwaitingPayment();
      await askedForPaymentAgo(late.id, settings.cancelAfterHours * 60 - 10);
      await expect(
        service.startDirectPayment(late.id, { method: "bank_transfer" }),
      ).rejects.toBeInstanceOf(NotEnoughTimeToPayError);
      await expect(
        service.startDirectPayment(late.id, { method: "ussd", bank: "737" }),
      ).rejects.toBeInstanceOf(NotEnoughTimeToPayError);
    });

    it("refuses once the order isn't awaiting payment", async () => {
      const order = await orderMovedToAwaitingPayment();
      await db.update(orders).set({ status: "paid" }).where(eq(orders.id, order.id));
      await expect(
        service.startDirectPayment(order.id, { method: "bank_transfer" }),
      ).rejects.toBeInstanceOf(OrderNotAwaitingPaymentError);
    });

    it("two taps at once open only one account", async () => {
      const order = await orderMovedToAwaitingPayment();
      const before = paystack.charges;
      const [a, b] = await Promise.all([
        service.startDirectPayment(order.id, { method: "bank_transfer" }),
        service.startDirectPayment(order.id, { method: "bank_transfer" }),
      ]);
      expect(a).toEqual(b);
      expect(paystack.charges - before).toBe(1);
    });
  });

  it("gives Paystack the customer's real email when they left one, a stand-in otherwise", async () => {
    const withEmail = await ordersService.createFromStorefront(slug, {
      customer: { name: "Ada", phone: "2348022224444", email: "ada@example.com" },
      delivery: TEST_DELIVERY,
      items: [{ variantId, quantity: 1 }],
    });
    await ordersService.transition({
      orderId: withEmail.id,
      to: "awaiting_payment",
      actor: "seller",
      sellerId,
    });
    await service.ensurePaymentLink(withEmail.id);
    expect(paystack.lastInitialize?.email).toBe("ada@example.com");
    await service.startDirectPayment(withEmail.id, { method: "bank_transfer" });
    expect(paystack.lastTransfer?.email).toBe("ada@example.com");

    await orderAwaitingPayment();
    expect(paystack.lastInitialize?.email).toBe("2348022223333@customers.gbam.app");
  });
});
