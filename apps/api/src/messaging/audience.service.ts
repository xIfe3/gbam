import { orderEvents, orders, products, sellers, users } from "@gbam/db";
import type { Audience } from "@gbam/shared";
import { Injectable } from "@nestjs/common";
import { and, eq, exists, gte, isNotNull, isNull, lte, ne, not, type SQL } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";

export type AudienceMember = { sellerId: string; email: string; businessName: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Turns an audience (filters picked by an admin) into the shops it means. Suspended and
 * closed shops are always left out, and so are shops with no owner. For email
 * (`forEmail`), sellers who switched off "news and tips" are left out too.
 */
@Injectable()
export class AudienceService {
  constructor(@InjectDb() private readonly db: Db) {}

  async sellers(audience: Audience, forEmail: boolean): Promise<AudienceMember[]> {
    return this.db
      .select({ sellerId: sellers.id, email: users.email, businessName: sellers.businessName })
      .from(sellers)
      .innerJoin(users, eq(users.id, sellers.ownerUserId))
      .where(and(...this.conditions(audience, forEmail)))
      .orderBy(sellers.createdAt);
  }

  async count(audience: Audience, forEmail: boolean): Promise<number> {
    const list = await this.sellers(audience, forEmail);
    return list.length;
  }

  private conditions(audience: Audience, forEmail: boolean): SQL[] {
    const conditions: SQL[] = [isNull(sellers.closedAt), isNull(sellers.suspendedAt)];
    if (forEmail) {
      conditions.push(eq(sellers.newsEmails, true));
    }
    if (audience.shopId) {
      conditions.push(eq(sellers.id, audience.shopId));
    }
    if (audience.verified === true) {
      conditions.push(isNotNull(users.emailVerifiedAt));
    } else if (audience.verified === false) {
      conditions.push(isNull(users.emailVerifiedAt));
    }
    if (audience.hasBank === true) {
      conditions.push(isNotNull(sellers.paystackSubaccountCode));
    } else if (audience.hasBank === false) {
      conditions.push(isNull(sellers.paystackSubaccountCode));
    }
    if (audience.hasProducts !== undefined) {
      // "exists (select ...)": the shop has at least one product that isn't archived.
      const hasProducts = exists(
        this.db
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.sellerId, sellers.id), ne(products.status, "archived"))),
      );
      if (audience.hasProducts) {
        conditions.push(hasProducts);
      } else {
        conditions.push(not(hasProducts));
      }
    }
    if (audience.noOrderDays !== undefined) {
      const since = new Date(Date.now() - audience.noOrderDays * DAY_MS);
      const paidRecently = exists(
        this.db
          .select({ id: orderEvents.id })
          .from(orderEvents)
          .innerJoin(orders, eq(orders.id, orderEvents.orderId))
          .where(
            and(
              eq(orders.sellerId, sellers.id),
              eq(orderEvents.toStatus, "paid"),
              gte(orderEvents.createdAt, since),
            ),
          ),
      );
      conditions.push(not(paidRecently));
    }
    // Days are Lagos days (UTC+1).
    if (audience.signedUpFrom) {
      conditions.push(gte(sellers.createdAt, new Date(`${audience.signedUpFrom}T00:00:00+01:00`)));
    }
    if (audience.signedUpTo) {
      conditions.push(
        lte(sellers.createdAt, new Date(`${audience.signedUpTo}T23:59:59.999+01:00`)),
      );
    }
    return conditions;
  }
}
