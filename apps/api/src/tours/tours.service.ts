import { sellerTours } from "@gbam/db";
import type { TourName, TourOutcome } from "@gbam/shared";
import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";

export type TourState = { step: number; outcome: TourOutcome | null };

@Injectable()
export class ToursService {
  constructor(@InjectDb() private readonly db: Db) {}

  /** Every tour this seller has started, keyed by tour name. */
  async list(sellerId: string): Promise<Partial<Record<TourName, TourState>>> {
    const rows = await this.db.select().from(sellerTours).where(eq(sellerTours.sellerId, sellerId));
    const result: Partial<Record<TourName, TourState>> = {};
    for (const row of rows) {
      result[row.tour] = { step: row.currentStep, outcome: row.outcome };
    }
    return result;
  }

  /**
   * Remembers the step the seller is on. "Upsert": create the row, or update it if it
   * exists, but ONLY while the tour is unfinished. The `setWhere` makes the database skip
   * the update for a finished tour, so a slow save arriving late can't reopen it.
   */
  async saveStep(sellerId: string, tour: TourName, step: number): Promise<TourState> {
    await this.db
      .insert(sellerTours)
      .values({ sellerId, tour, currentStep: step })
      .onConflictDoUpdate({
        target: [sellerTours.sellerId, sellerTours.tour],
        set: { currentStep: step, updatedAt: new Date() },
        setWhere: sql`${sellerTours.outcome} is null`,
      });
    return this.read(sellerId, tour);
  }

  /**
   * Records how the tour ended. Same upsert, and again only while the tour is unfinished:
   * two devices finishing at the same moment both run this, the database lets the first
   * one through and the second finds the outcome already set, so exactly one outcome stays.
   */
  async finish(sellerId: string, tour: TourName, outcome: TourOutcome): Promise<TourState> {
    await this.db
      .insert(sellerTours)
      .values({ sellerId, tour, outcome })
      .onConflictDoUpdate({
        target: [sellerTours.sellerId, sellerTours.tour],
        set: { outcome, updatedAt: new Date() },
        setWhere: sql`${sellerTours.outcome} is null`,
      });
    return this.read(sellerId, tour);
  }

  private async read(sellerId: string, tour: TourName): Promise<TourState> {
    const rows = await this.db
      .select()
      .from(sellerTours)
      .where(and(eq(sellerTours.sellerId, sellerId), eq(sellerTours.tour, tour)));
    const row = rows[0];
    if (!row) {
      throw new Error(`Tour row for ${tour} vanished right after it was written`);
    }
    return { step: row.currentStep, outcome: row.outcome };
  }
}
