import { deliveryZones, sellers } from "@gbam/db";
import type { DeliverySettingsInput } from "@gbam/shared";
import { Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";

export type DeliveryZone = { id: string; name: string; feeKobo: number; isPickup: boolean };
export type DeliverySettings = { zones: DeliveryZone[]; pickupNote: string | null };

/** Settings → Delivery: a seller's delivery zones (with prices) and their pickup note. */
@Injectable()
export class DeliveryService {
  constructor(@InjectDb() private readonly db: Db) {}

  /** The live zones (not removed), in the seller's order, and the pickup note. */
  async get(sellerId: string): Promise<DeliverySettings> {
    const sellerRows = await this.db
      .select({ pickupNote: sellers.pickupNote })
      .from(sellers)
      .where(eq(sellers.id, sellerId));
    const seller = sellerRows[0];
    if (!seller) {
      throw new NotFoundException("Shop not found");
    }

    const zoneRows = await this.db
      .select({
        id: deliveryZones.id,
        name: deliveryZones.name,
        feeKobo: deliveryZones.feeKobo,
        isPickup: deliveryZones.isPickup,
      })
      .from(deliveryZones)
      .where(and(eq(deliveryZones.sellerId, sellerId), isNull(deliveryZones.archivedAt)))
      .orderBy(asc(deliveryZones.sortOrder), asc(deliveryZones.createdAt));

    return { zones: zoneRows, pickupNote: seller.pickupNote };
  }

  /**
   * Saves the whole list at once, the way the seller sees it on screen:
   * - a zone with an `id` is updated (it must be one of this shop's live zones),
   * - a zone without one is new,
   * - a live zone missing from the list was removed, so it's archived (old orders keep
   *   their own copy of its name and fee, so nothing they show changes).
   * The position in the list becomes the zone's sort order.
   */
  async save(sellerId: string, input: DeliverySettingsInput): Promise<DeliverySettings> {
    // A transaction: either the whole list is saved, or none of it.
    await this.db.transaction(async (tx) => {
      const liveRows = await tx
        .select({ id: deliveryZones.id })
        .from(deliveryZones)
        .where(and(eq(deliveryZones.sellerId, sellerId), isNull(deliveryZones.archivedAt)));
      const liveIds = new Set<string>();
      for (const row of liveRows) {
        liveIds.add(row.id);
      }

      const keptIds = new Set<string>();
      for (let position = 0; position < input.zones.length; position++) {
        const zone = input.zones[position];
        if (zone === undefined) {
          continue;
        }
        const values = {
          name: zone.name,
          feeKobo: zone.feeKobo,
          isPickup: zone.isPickup,
          sortOrder: position,
        };

        if (zone.id === undefined) {
          await tx.insert(deliveryZones).values({ ...values, sellerId });
          continue;
        }
        // Another shop's id, or a zone already removed: the same 404, so ids reveal nothing.
        if (!liveIds.has(zone.id)) {
          throw new NotFoundException("Delivery zone not found");
        }
        keptIds.add(zone.id);
        await tx.update(deliveryZones).set(values).where(eq(deliveryZones.id, zone.id));
      }

      const now = new Date();
      for (const liveId of liveIds) {
        if (!keptIds.has(liveId)) {
          await tx
            .update(deliveryZones)
            .set({ archivedAt: now })
            .where(eq(deliveryZones.id, liveId));
        }
      }

      await tx
        .update(sellers)
        .set({ pickupNote: input.pickupNote })
        .where(eq(sellers.id, sellerId));
    });

    return this.get(sellerId);
  }
}
