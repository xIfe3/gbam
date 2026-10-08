import { orders, products, sellers, users } from "@gbam/db";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { AuthService } from "../auth/auth.service.js";
import { EmailQueue } from "../email/email.queue.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AuditService } from "./audit.service.js";

const PAGE_SIZE = 50;

export type ShopStatus = "active" | "suspended" | "closed";

export type ShopListQuery = {
  q?: string;
  status?: ShopStatus;
  hasProducts?: boolean;
  hasBank?: boolean;
  page: number;
  sort: "newest" | "oldest" | "name";
};

/** What a bulk action did: which ids it changed, and which it skipped and why. */
export type BulkResult = { done: string[]; skipped: { id: string; why: string }[] };

function statusOf(row: { closedAt: Date | null; suspendedAt: Date | null }): ShopStatus {
  if (row.closedAt !== null) {
    return "closed";
  }
  if (row.suspendedAt !== null) {
    return "suspended";
  }
  return "active";
}

/** Shops, as the admin area sees them: search, details, and the few fixes admins may make. */
@Injectable()
export class ShopsAdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
    private readonly emails: EmailQueue,
  ) {}

  async list(query: ShopListQuery) {
    const conditions: SQL[] = [];
    if (query.q && query.q.trim() !== "") {
      const pattern = `%${query.q.trim()}%`;
      const match = or(
        ilike(sellers.businessName, pattern),
        ilike(sellers.slug, pattern),
        ilike(users.email, pattern),
      );
      if (match) {
        conditions.push(match);
      }
    }
    if (query.status === "active") {
      conditions.push(isNull(sellers.closedAt), isNull(sellers.suspendedAt));
    } else if (query.status === "suspended") {
      conditions.push(isNull(sellers.closedAt), isNotNull(sellers.suspendedAt));
    } else if (query.status === "closed") {
      conditions.push(isNotNull(sellers.closedAt));
    }
    if (query.hasBank === true) {
      conditions.push(isNotNull(sellers.paystackSubaccountCode));
    } else if (query.hasBank === false) {
      conditions.push(isNull(sellers.paystackSubaccountCode));
    }
    // A "subquery" counting each shop's products, so the list can show and filter by it.
    const productCount = sql<number>`(select count(*)::int from ${products} where ${products.sellerId} = ${sellers.id} and ${products.status} <> 'archived')`;
    if (query.hasProducts === true) {
      conditions.push(sql`${productCount} > 0`);
    } else if (query.hasProducts === false) {
      conditions.push(sql`${productCount} = 0`);
    }

    let orderBy = desc(sellers.createdAt);
    if (query.sort === "oldest") {
      orderBy = asc(sellers.createdAt);
    } else if (query.sort === "name") {
      orderBy = asc(sellers.businessName);
    }

    const where = and(...conditions);
    const rows = await this.db
      .select({
        id: sellers.id,
        slug: sellers.slug,
        businessName: sellers.businessName,
        ownerEmail: users.email,
        closedAt: sellers.closedAt,
        suspendedAt: sellers.suspendedAt,
        hasBank: sql<boolean>`${sellers.paystackSubaccountCode} is not null`,
        productCount,
        createdAt: sellers.createdAt,
      })
      .from(sellers)
      .leftJoin(users, eq(users.id, sellers.ownerUserId))
      .where(where)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((query.page - 1) * PAGE_SIZE);
    const totals = await this.db
      .select({ total: count() })
      .from(sellers)
      .leftJoin(users, eq(users.id, sellers.ownerUserId))
      .where(where);

    const list = [];
    for (const row of rows) {
      list.push({ ...row, status: statusOf(row) });
    }
    return { rows: list, total: totals[0]?.total ?? 0, page: query.page, pageSize: PAGE_SIZE };
  }

  async detail(sellerId: string) {
    const rows = await this.db
      .select({ seller: sellers, owner: users })
      .from(sellers)
      .leftJoin(users, eq(users.id, sellers.ownerUserId))
      .where(eq(sellers.id, sellerId));
    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Shop not found");
    }
    const seller = row.seller;

    let owner = null;
    if (row.owner) {
      owner = {
        id: row.owner.id,
        email: row.owner.email,
        emailVerified: row.owner.emailVerifiedAt !== null,
        lockedUntil: row.owner.lockedUntil,
        createdAt: row.owner.createdAt,
      };
    }
    let payoutAccount = null;
    if (seller.bankName !== null && seller.accountLast4 !== null) {
      // Only what's safe to show: never a full account number.
      payoutAccount = {
        bankName: seller.bankName,
        accountLast4: seller.accountLast4,
        bankAccountName: seller.bankAccountName,
      };
    }
    const productCount = await this.db
      .select({ total: count() })
      .from(products)
      .where(and(eq(products.sellerId, sellerId), sql`${products.status} <> 'archived'`));
    const recentOrders = await this.db
      .select({
        id: orders.id,
        code: orders.code,
        status: orders.status,
        totalKobo: orders.totalKobo,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.sellerId, sellerId))
      .orderBy(desc(orders.createdAt))
      .limit(10);

    return {
      shop: {
        id: seller.id,
        slug: seller.slug,
        businessName: seller.businessName,
        whatsappPhone: seller.whatsappPhone,
        status: statusOf(seller),
        suspendedAt: seller.suspendedAt,
        suspendedReason: seller.suspendedReason,
        closedAt: seller.closedAt,
        feeWaivedUntil: seller.feeWaivedUntil,
        createdAt: seller.createdAt,
        productCount: productCount[0]?.total ?? 0,
      },
      owner,
      payoutAccount,
      recentOrders,
    };
  }

  // ---- Suspend / reopen ----

  async suspend(sellerId: string, reason: string, actor: AdminContext, ip: string) {
    const result = await this.setSuspended([sellerId], true, reason, actor, ip, null);
    return this.singleResult(result);
  }

  async reopen(sellerId: string, reason: string, actor: AdminContext, ip: string) {
    const result = await this.setSuspended([sellerId], false, reason, actor, ip, null);
    return this.singleResult(result);
  }

  async bulkSetSuspended(
    ids: string[],
    suspend: boolean,
    note: string,
    actor: AdminContext,
    ip: string,
  ) {
    // One batch id ties the audit entries of this bulk action together.
    return this.setSuspended(ids, suspend, note, actor, ip, randomUUID());
  }

  /** A single-shop action that was skipped is an error the admin should see. */
  private singleResult(result: BulkResult) {
    const skipped = result.skipped[0];
    if (skipped) {
      throw new BadRequestException(skipped.why);
    }
    return { ok: true };
  }

  private async setSuspended(
    ids: string[],
    suspend: boolean,
    reason: string,
    actor: AdminContext,
    ip: string,
    batchId: string | null,
  ): Promise<BulkResult> {
    const result: BulkResult = { done: [], skipped: [] };
    let action = "shop.reopen";
    let emailKind: "shop_suspended" | "shop_reopened" = "shop_reopened";
    if (suspend) {
      action = "shop.suspend";
      emailKind = "shop_suspended";
    }

    for (const sellerId of ids) {
      const changed = await this.db.transaction(async (tx) => {
        // Lock the shop's row so two admins can't suspend/reopen it at the same moment.
        const rows = await tx.select().from(sellers).where(eq(sellers.id, sellerId)).for("update");
        const seller = rows[0];
        if (!seller) {
          return "Shop not found";
        }
        if (seller.closedAt !== null) {
          return "Shop is closed";
        }
        if (suspend && seller.suspendedAt !== null) {
          return "Already suspended";
        }
        if (!suspend && seller.suspendedAt === null) {
          return "Not suspended";
        }

        if (suspend) {
          await tx
            .update(sellers)
            .set({ suspendedAt: new Date(), suspendedReason: reason })
            .where(eq(sellers.id, sellerId));
        } else {
          await tx
            .update(sellers)
            .set({ suspendedAt: null, suspendedReason: null })
            .where(eq(sellers.id, sellerId));
        }
        await this.audit.record(
          {
            adminId: actor.id,
            action,
            targetType: "shop",
            targetId: sellerId,
            note: reason,
            before: { suspended: seller.suspendedAt !== null },
            after: { suspended: suspend },
            ip,
            batchId: batchId ?? undefined,
          },
          tx,
        );
        return null;
      });

      if (changed === null) {
        result.done.push(sellerId);
        await this.emailOwner(sellerId, emailKind);
      } else {
        result.skipped.push({ id: sellerId, why: changed });
      }
    }
    return result;
  }

  /** Tells the owner their shop was suspended or reopened. Failures are logged, not thrown. */
  private async emailOwner(sellerId: string, kind: "shop_suspended" | "shop_reopened") {
    try {
      const rows = await this.db
        .select({ email: users.email, shopName: sellers.businessName })
        .from(sellers)
        .innerJoin(users, eq(users.id, sellers.ownerUserId))
        .where(eq(sellers.id, sellerId));
      const owner = rows[0];
      if (!owner) {
        return;
      }
      await this.emails.send(`${kind}-${sellerId}-${Date.now()}`, {
        kind,
        to: owner.email,
        shopName: owner.shopName,
      });
    } catch {
      // The suspension itself is saved; the email is a courtesy.
    }
  }

  // ---- Helping sellers ----

  private async ownerOf(sellerId: string): Promise<string> {
    const rows = await this.db
      .select({ ownerUserId: sellers.ownerUserId })
      .from(sellers)
      .where(eq(sellers.id, sellerId));
    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Shop not found");
    }
    if (row.ownerUserId === null) {
      throw new BadRequestException("This shop has no owner account");
    }
    return row.ownerUserId;
  }

  /** Clears the "too many wrong passwords" lock, so the seller can try again now. */
  async unlockSeller(sellerId: string, actor: AdminContext, ip: string) {
    const userId = await this.ownerOf(sellerId);
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ failedLoginCount: 0, lockedUntil: null })
        .where(eq(users.id, userId));
      await this.audit.record(
        {
          adminId: actor.id,
          action: "seller.unlocked",
          targetType: "shop",
          targetId: sellerId,
          ip,
        },
        tx,
      );
    });
    return { ok: true };
  }

  /** Sends a new email-verification code (same once-a-minute limit as the seller has). */
  async resendVerification(sellerId: string, actor: AdminContext, ip: string) {
    const userId = await this.ownerOf(sellerId);
    await this.authService.resendCode(userId, "verify_email");
    await this.audit.record({
      adminId: actor.id,
      action: "seller.verification_resent",
      targetType: "shop",
      targetId: sellerId,
      ip,
    });
    return { ok: true };
  }

  /** Founding-seller offer: no Gbam fee until this date (null ends it). */
  async setFeeWaiver(sellerId: string, until: Date | null, actor: AdminContext, ip: string) {
    await this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ feeWaivedUntil: sellers.feeWaivedUntil })
        .from(sellers)
        .where(eq(sellers.id, sellerId));
      const seller = rows[0];
      if (!seller) {
        throw new NotFoundException("Shop not found");
      }
      await tx.update(sellers).set({ feeWaivedUntil: until }).where(eq(sellers.id, sellerId));
      await this.audit.record(
        {
          adminId: actor.id,
          action: "shop.fee_waiver",
          targetType: "shop",
          targetId: sellerId,
          before: { feeWaivedUntil: seller.feeWaivedUntil },
          after: { feeWaivedUntil: until },
          ip,
        },
        tx,
      );
    });
    return { ok: true };
  }
}
