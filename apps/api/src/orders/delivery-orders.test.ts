/**
 * Integration test against the dev Postgres + Redis (pnpm db:up && pnpm db:migrate).
 * Placing orders with delivery zones: the fee comes from the database, never the browser.
 */
import "reflect-metadata";
import { orders, sellers } from "@gbam/db";
import type { OrderDeliveryInput } from "@gbam/shared";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { DeliveryService } from "../settings/delivery.service.js";
import { SettingsModule } from "../settings/settings.module.js";
import { createTestProduct, createTestSeller } from "../test-helpers.js";
import { OrdersModule } from "./orders.module.js";
import { OrdersService } from "./orders.service.js";

process.loadEnvFile?.("../../.env");

describe("Orders with delivery (integration)", () => {
  let moduleRef: TestingModule;
  let service: OrdersService;
  let delivery: DeliveryService;
  let db: Db;
  const sellerIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, OrdersModule, SettingsModule],
    }).compile();
    moduleRef.enableShutdownHooks();
    service = moduleRef.get(OrdersService);
    delivery = moduleRef.get(DeliveryService);
    db = moduleRef.get(DB);
  });

  afterAll(async () => {
    if (sellerIds.length > 0) {
      await db.delete(sellers).where(inArray(sellers.id, sellerIds));
    }
    await moduleRef.close();
  });

  /** A shop with one ₦1,500 product and, optionally, delivery zones. */
  async function shop(
    zones: { name: string; feeKobo: number; isPickup: boolean }[],
    pickupNote: string | null = null,
  ) {
    const seller = await createTestSeller(db, "delivorder");
    sellerIds.push(seller.id);
    const created = await createTestProduct(db, seller.id, { priceKobo: 150_000 });
    const saved = await delivery.save(seller.id, { zones, pickupNote });
    return { seller, variantId: created.variant.id, zones: saved.zones };
  }

  function place(slug: string, variantId: string, deliveryInput: OrderDeliveryInput) {
    return service.createFromStorefront(slug, {
      customer: { name: "Ada", phone: "2348011112222" },
      items: [{ variantId, quantity: 2 }],
      delivery: deliveryInput,
    });
  }

  async function orderRow(orderId: string) {
    const rows = await db.select().from(orders).where(eq(orders.id, orderId));
    const row = rows[0];
    if (!row) {
      throw new Error("order not found");
    }
    return row;
  }

  const lekki = { name: "Lekki / VI", feeKobo: 250_000, isPickup: false };
  const pickup = { name: "Pickup from shop", feeKobo: 0, isPickup: true };

  it("order with a zone stores snapshot and total", async () => {
    const { seller, variantId, zones } = await shop([lekki]);
    const zone = zones[0];
    if (!zone) {
      throw new Error("expected a zone");
    }

    const order = await place(seller.slug, variantId, {
      zoneId: zone.id,
      expectedFeeKobo: 250_000,
      address: "12 Admiralty Way",
      landmark: "Opposite the bank",
    });

    const row = await orderRow(order.id);
    expect(row.subtotalKobo).toBe(300_000);
    expect(row.deliveryFeeKobo).toBe(250_000);
    expect(row.totalKobo).toBe(550_000);
    expect(row.deliveryZoneName).toBe("Lekki / VI");
    expect(row.deliveryIsPickup).toBe(false);
    expect(row.deliveryAddress).toBe("12 Admiralty Way");
    expect(row.deliveryLandmark).toBe("Opposite the bank");
  });

  it("changed fee is refused with the new price", async () => {
    const { seller, variantId, zones } = await shop([lekki]);
    const zoneId = zones[0]?.id ?? null;

    const error = await place(seller.slug, variantId, {
      zoneId,
      expectedFeeKobo: 200_000,
      address: "12 Admiralty Way",
      landmark: null,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      field: "delivery",
      message: "Delivery to Lekki / VI is now ₦2,500. Please check and confirm.",
    });
  });

  it("zone removed while checking out", async () => {
    const { seller, variantId, zones } = await shop([lekki]);
    const zoneId = zones[0]?.id ?? null;
    // The seller removes their only zone while the customer is on the checkout page.
    await delivery.save(seller.id, { zones: [], pickupNote: null });

    const error = await place(seller.slug, variantId, {
      zoneId,
      expectedFeeKobo: 250_000,
      address: "12 Admiralty Way",
      landmark: null,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      field: "delivery",
      message: "That delivery option isn't available any more. Please pick another.",
    });
  });

  it("another shop's zone is refused", async () => {
    const owner = await shop([lekki]);
    const other = await shop([lekki]);

    const error = await place(other.seller.slug, other.variantId, {
      zoneId: owner.zones[0]?.id ?? null,
      expectedFeeKobo: 250_000,
      address: "12 Admiralty Way",
      landmark: null,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
  });

  it("a shop with zones needs one picked", async () => {
    const { seller, variantId } = await shop([lekki]);
    const error = await place(seller.slug, variantId, {
      zoneId: null,
      expectedFeeKobo: null,
      address: "12 Admiralty Way",
      landmark: null,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      field: "delivery",
      message: "Choose a delivery option",
    });
  });

  it("pickup ignores a typed address", async () => {
    const { seller, variantId, zones } = await shop([pickup], "Shop 12, Balogun Market");
    const order = await place(seller.slug, variantId, {
      zoneId: zones[0]?.id ?? null,
      expectedFeeKobo: 0,
      address: "Something typed before switching to pickup",
      landmark: "Old landmark",
    });

    const row = await orderRow(order.id);
    expect(row.deliveryIsPickup).toBe(true);
    expect(row.deliveryAddress).toBeNull();
    expect(row.deliveryLandmark).toBeNull();
    expect(row.totalKobo).toBe(300_000);
  });

  it("free delivery zone still needs address", async () => {
    const { seller, variantId, zones } = await shop([{ name: "Ikeja", feeKobo: 0, isPickup: false }]);
    const error = await place(seller.slug, variantId, {
      zoneId: zones[0]?.id ?? null,
      expectedFeeKobo: 0,
      address: null,
      landmark: null,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ field: "address" });
  });

  it("an address shorter than 5 characters is refused", async () => {
    const { seller, variantId } = await shop([]);
    const error = await place(seller.slug, variantId, {
      zoneId: null,
      expectedFeeKobo: null,
      address: "Ikj",
      landmark: null,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ field: "address" });
  });

  it("no zones: address required, fee 0", async () => {
    const { seller, variantId } = await shop([]);

    const missing = await place(seller.slug, variantId, {
      zoneId: null,
      expectedFeeKobo: null,
      address: null,
      landmark: null,
    }).catch((e: unknown) => e);
    expect(missing).toBeInstanceOf(BadRequestException);

    const order = await place(seller.slug, variantId, {
      zoneId: null,
      expectedFeeKobo: null,
      address: "5 Allen Avenue, Ikeja",
      landmark: null,
    });
    const row = await orderRow(order.id);
    expect(row.deliveryFeeKobo).toBe(0);
    expect(row.deliveryZoneName).toBeNull();
    expect(row.totalKobo).toBe(300_000);
    expect(row.deliveryAddress).toBe("5 Allen Avenue, Ikeja");
  });

  it("editing a zone later does not change the order", async () => {
    const { seller, variantId, zones } = await shop([lekki]);
    const zone = zones[0];
    if (!zone) {
      throw new Error("expected a zone");
    }
    const order = await place(seller.slug, variantId, {
      zoneId: zone.id,
      expectedFeeKobo: 250_000,
      address: "12 Admiralty Way",
      landmark: null,
    });

    await delivery.save(seller.id, {
      zones: [{ id: zone.id, name: "Lekki only", feeKobo: 400_000, isPickup: false }],
      pickupNote: null,
    });

    const row = await orderRow(order.id);
    expect(row.deliveryZoneName).toBe("Lekki / VI");
    expect(row.deliveryFeeKobo).toBe(250_000);
  });
});
