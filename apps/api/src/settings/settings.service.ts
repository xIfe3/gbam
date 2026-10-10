import { sellers, shopSlugHistory } from "@gbam/db";
import {
  RESERVED_SLUGS,
  slugSchema,
  type EmailSettingsInput,
  type ShopSettingsInput,
} from "@gbam/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, ne } from "drizzle-orm";
import { isUniqueViolation } from "../common/db-errors.js";
import { InjectDb, type Db } from "../infra/infra.module.js";

export type ShopSettings = {
  slug: string;
  businessName: string;
  phone: string;
  /** Only what's safe to show: bank, last 4 digits, account holder's name. */
  payoutAccount: { bankName: string; accountLast4: string; bankAccountName: string } | null;
  /** Email the owner when a new order comes in. */
  newOrderEmails: boolean;
  /** Gbam's "news and tips" announcements. */
  newsEmails: boolean;
  /** When the shop link can next be changed (null = now). */
  nextSlugChangeAt: Date | null;
};

/** A shop can change its link at most this often, so shared links don't keep moving. */
const SLUG_CHANGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The day a link change is allowed again, or null when it's allowed now. */
function nextSlugChange(changedAt: Date | null, now: Date): Date | null {
  if (changedAt === null) {
    return null;
  }
  const next = new Date(changedAt.getTime() + SLUG_CHANGE_DAYS * DAY_MS);
  if (next.getTime() <= now.getTime()) {
    return null;
  }
  return next;
}

/**
 * The seller's own shop details for /dashboard/settings. Password changes and account
 * deletion live in AuthService; bank changes in PayoutsService (they talk to Paystack).
 */
@Injectable()
export class SettingsService {
  constructor(@InjectDb() private readonly db: Db) {}

  async get(sellerId: string): Promise<ShopSettings> {
    const rows = await this.db.select().from(sellers).where(eq(sellers.id, sellerId));
    const seller = rows[0];
    if (!seller) {
      throw new NotFoundException("Shop not found");
    }

    let payoutAccount: ShopSettings["payoutAccount"] = null;
    if (
      seller.bankName !== null &&
      seller.accountLast4 !== null &&
      seller.bankAccountName !== null
    ) {
      payoutAccount = {
        bankName: seller.bankName,
        accountLast4: seller.accountLast4,
        bankAccountName: seller.bankAccountName,
      };
    }
    return {
      slug: seller.slug,
      businessName: seller.businessName,
      phone: seller.whatsappPhone,
      payoutAccount,
      newOrderEmails: seller.newOrderEmails,
      newsEmails: seller.newsEmails,
      nextSlugChangeAt: nextSlugChange(seller.slugChangedAt, new Date()),
    };
  }

  /** New shop name and/or WhatsApp number. The shop link stays: it's already been shared. */
  async updateShop(sellerId: string, input: ShopSettingsInput): Promise<ShopSettings> {
    try {
      await this.db
        .update(sellers)
        .set({ businessName: input.businessName, whatsappPhone: input.phone })
        .where(eq(sellers.id, sellerId));
    } catch (error) {
      // Two shops can't share a WhatsApp number (customers' messages would go to the wrong one).
      if (isUniqueViolation(error, "sellers_whatsapp_phone_unique")) {
        throw new ConflictException({
          field: "phone",
          message: "That phone number is already used by another shop",
        });
      }
      throw error;
    }
    return this.get(sellerId);
  }

  /** Turns optional emails (like "new order") on or off. */
  async updateEmails(sellerId: string, input: EmailSettingsInput): Promise<ShopSettings> {
    const changes: { newOrderEmails: boolean; newsEmails?: boolean } = {
      newOrderEmails: input.newOrderEmails,
    };
    // Older pages don't send newsEmails: then it's left as it is.
    if (input.newsEmails !== undefined) {
      changes.newsEmails = input.newsEmails;
    }
    await this.db.update(sellers).set(changes).where(eq(sellers.id, sellerId));
    return this.get(sellerId);
  }

  /**
   * Is this link free for this shop? Another shop's current or old link is taken; the shop's
   * own old links are free for it to go back to.
   */
  async slugAvailableFor(
    sellerId: string,
    slug: string,
  ): Promise<{ available: boolean; reason?: "taken" | "reserved" | "invalid" }> {
    if (RESERVED_SLUGS.has(slug)) {
      return { available: false, reason: "reserved" };
    }
    if (!slugSchema.safeParse(slug).success) {
      return { available: false, reason: "invalid" };
    }
    const current = await this.db
      .select({ id: sellers.id })
      .from(sellers)
      .where(and(eq(sellers.slug, slug), ne(sellers.id, sellerId)));
    if (current.length > 0) {
      return { available: false, reason: "taken" };
    }
    const old = await this.db
      .select({ id: shopSlugHistory.id })
      .from(shopSlugHistory)
      .where(and(eq(shopSlugHistory.slug, slug), ne(shopSlugHistory.sellerId, sellerId)));
    if (old.length > 0) {
      return { available: false, reason: "taken" };
    }
    return { available: true };
  }

  /**
   * A new shop link. The old one keeps redirecting to the new one (and stays the shop's), and
   * a shop can do this at most once every 30 days.
   */
  async changeSlug(sellerId: string, slug: string) {
    const rows = await this.db.select().from(sellers).where(eq(sellers.id, sellerId));
    const seller = rows[0];
    if (!seller) {
      throw new NotFoundException("Shop not found");
    }
    if (slug === seller.slug) {
      throw new BadRequestException({ field: "slug", message: "That's already your link" });
    }
    const check = await this.slugAvailableFor(sellerId, slug);
    if (check.reason === "reserved") {
      throw new BadRequestException({ field: "slug", message: "That name is reserved" });
    }
    if (check.reason === "invalid") {
      throw new BadRequestException({
        field: "slug",
        message: "Use 3 to 40 lowercase letters, numbers and hyphens",
      });
    }
    if (!check.available) {
      throw new ConflictException({ field: "slug", message: "That link is taken" });
    }
    const now = new Date();
    const next = nextSlugChange(seller.slugChangedAt, now);
    if (next !== null) {
      const day = next.toLocaleDateString("en-NG", {
        dateStyle: "medium",
        timeZone: "Africa/Lagos",
      });
      throw new BadRequestException({
        field: "slug",
        message: `You changed your link recently. Your next change is possible from ${day}.`,
      });
    }

    try {
      // A transaction: the old link is kept and the new one set together, or neither.
      await this.db.transaction(async (tx) => {
        // Going back to one of its own old links: it isn't "old" any more.
        await tx
          .delete(shopSlugHistory)
          .where(and(eq(shopSlugHistory.slug, slug), eq(shopSlugHistory.sellerId, sellerId)));
        await tx.insert(shopSlugHistory).values({ sellerId, slug: seller.slug });
        await tx.update(sellers).set({ slug, slugChangedAt: now }).where(eq(sellers.id, sellerId));
      });
    } catch (error) {
      // Someone else took it in the same moment.
      if (isUniqueViolation(error, "sellers_slug_unique")) {
        throw new ConflictException({ field: "slug", message: "That link is taken" });
      }
      throw error;
    }
    return { slug, nextSlugChangeAt: nextSlugChange(now, now) };
  }
}
