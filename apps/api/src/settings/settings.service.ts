import { sellers } from "@gbam/db";
import type { EmailSettingsInput, ShopSettingsInput } from "@gbam/shared";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
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
};

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
}
