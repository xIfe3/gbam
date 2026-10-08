/** Integration test against the dev Postgres (pnpm db:up && pnpm db:migrate). */
import "reflect-metadata";
import { deliveryZones, sellers } from "@gbam/db";
import { deliverySettingsSchema } from "@gbam/shared";
import { NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { ProductsModule } from "../products/products.module.js";
import { StorefrontService } from "../products/storefront.service.js";
import { createTestSeller } from "../test-helpers.js";
import { DeliveryService } from "./delivery.service.js";
import { SettingsModule } from "./settings.module.js";

process.loadEnvFile?.("../../.env");

describe("DeliveryService (integration)", () => {
  let moduleRef: TestingModule;
  let service: DeliveryService;
  let storefront: StorefrontService;
  let db: Db;
  const sellerIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, IntegrationsModule, SettingsModule, ProductsModule],
    }).compile();
    moduleRef.enableShutdownHooks();
    service = moduleRef.get(DeliveryService);
    storefront = moduleRef.get(StorefrontService);
    db = moduleRef.get(DB);
  });

  afterAll(async () => {
    if (sellerIds.length > 0) {
      await db.delete(sellers).where(inArray(sellers.id, sellerIds));
    }
    await moduleRef.close();
  });

  async function newSeller() {
    const seller = await createTestSeller(db, "delivery");
    sellerIds.push(seller.id);
    return seller;
  }

  const lekki = { name: "Lekki / VI", feeKobo: 250_000, isPickup: false };
  const mainland = { name: "Mainland", feeKobo: 350_000, isPickup: false };
  const pickup = { name: "Pickup from shop", feeKobo: 0, isPickup: true };

  it("saves, reorders and removes zones", async () => {
    const seller = await newSeller();
    const first = await service.save(seller.id, {
      zones: [lekki, mainland, pickup],
      pickupNote: "Shop 12, Balogun Market",
    });
    expect(first.zones.map((z) => z.name)).toEqual(["Lekki / VI", "Mainland", "Pickup from shop"]);
    expect(first.pickupNote).toBe("Shop 12, Balogun Market");

    const lekkiId = first.zones[0]?.id;
    const pickupId = first.zones[2]?.id;
    // Pickup moves first, Lekki's price changes, Mainland is removed.
    const second = await service.save(seller.id, {
      zones: [
        { ...pickup, id: pickupId },
        { ...lekki, id: lekkiId, feeKobo: 300_000 },
      ],
      pickupNote: null,
    });
    expect(second.zones).toEqual([
      { id: pickupId, name: "Pickup from shop", feeKobo: 0, isPickup: true },
      { id: lekkiId, name: "Lekki / VI", feeKobo: 300_000, isPickup: false },
    ]);
    expect(second.pickupNote).toBeNull();
  });

  it("removed zone is archived not deleted", async () => {
    const seller = await newSeller();
    const saved = await service.save(seller.id, { zones: [lekki, mainland], pickupNote: null });
    const mainlandId = saved.zones[1]?.id;
    if (!mainlandId) {
      throw new Error("expected a Mainland zone");
    }
    await service.save(seller.id, { zones: [saved.zones[0] ?? lekki], pickupNote: null });

    const rows = await db.select().from(deliveryZones).where(eq(deliveryZones.id, mainlandId));
    expect(rows[0]?.archivedAt).toBeInstanceOf(Date);
  });

  it("another shop's zone id gives NotFoundException", async () => {
    const owner = await newSeller();
    const other = await newSeller();
    const saved = await service.save(owner.id, { zones: [lekki], pickupNote: null });
    const ownerZoneId = saved.zones[0]?.id;

    await expect(
      service.save(other.id, { zones: [{ ...lekki, id: ownerZoneId }], pickupNote: null }),
    ).rejects.toBeInstanceOf(NotFoundException);
    // The owner's zone is untouched.
    const ownerNow = await service.get(owner.id);
    expect(ownerNow.zones).toHaveLength(1);
  });

  it("duplicate names refused ignoring case and spaces", () => {
    const result = deliverySettingsSchema.safeParse({
      zones: [lekki, { ...mainland, name: " LEKKI / vi " }],
      pickupNote: null,
    });
    expect(result.success).toBe(false);
  });

  it("storefront lists only live zones in order", async () => {
    const seller = await newSeller();
    const saved = await service.save(seller.id, {
      zones: [mainland, lekki, pickup],
      pickupNote: "Back gate",
    });
    await service.save(seller.id, {
      zones: [saved.zones[2] ?? pickup, saved.zones[0] ?? mainland],
      pickupNote: "Back gate",
    });

    const page = await storefront.list(seller.slug);
    expect(page.store.delivery.zones.map((z) => z.name)).toEqual(["Pickup from shop", "Mainland"]);
    expect(page.store.delivery.pickupNote).toBe("Back gate");
  });
});
