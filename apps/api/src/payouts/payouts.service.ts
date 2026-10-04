import { sellers } from "@gbam/db";
import { PaystackError, type Bank } from "@gbam/integrations";
import type { PayoutAccountInput } from "@gbam/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import type { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { RateLimiter, TooManyRequestsError } from "../common/rate-limiter.js";
import { InjectDb, REDIS, type Db } from "../infra/infra.module.js";
import { InjectPaystack, type PaystackClient } from "../integrations/integrations.module.js";

/** Where the bank list is cached. Shared by everyone, and holds no seller data. */
export const BANKS_CACHE_KEY = "payouts:banks:v1";
const BANKS_CACHE_SECONDS = 24 * 60 * 60;

const RESOLVE_LIMIT = 10;
const RESOLVE_WINDOW_SECONDS = 10 * 60;
const CREATE_LIMIT = 5;
const CREATE_WINDOW_SECONDS = 24 * 60 * 60;
// How long the create lock lives. While locked we make exactly two Paystack calls
// (resolve, then create), each cut off after 15 seconds by the Paystack client, plus two
// quick database queries: worst case about 2 × 15 = 30 seconds. 60 leaves 30 seconds of
// headroom. The bank list (which can take several slow pages) is loaded BEFORE locking.
const CREATE_LOCK_SECONDS = 60;

// Paystack answers these statuses when the account number doesn't exist at that bank.
// 401/403 are NOT here: they mean our secret key is wrong, which is our problem to fix,
// not the seller's, so they get the "try again" answer.
const ACCOUNT_NOT_FOUND_STATUSES = new Set([400, 404, 422]);
// Paystack's answers when it refuses the subaccount details themselves.
const DETAILS_REJECTED_STATUSES = new Set([400, 422]);

// What we expect to find in the bank-list cache. Anything else is ignored and refetched.
const cachedBanksSchema = z.array(z.object({ name: z.string(), code: z.string() })).min(1);

export type SavedPayoutAccount = {
  bankName: string;
  accountLast4: string;
  bankAccountName: string;
};

/**
 * Step 3 of sign-up: the seller's bank account → Paystack checks whose account it is →
 * the seller confirms the name → we create their Paystack subaccount (where their share
 * of every payment goes).
 *
 * The full account number is only ever passed on to Paystack. We keep the last 4 digits,
 * and never put the full number in the database, logs, Redis keys or error messages.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectPaystack() private readonly paystack: PaystackClient,
    private readonly limiter: RateLimiter,
  ) {}

  /** Nigerian banks, from Redis when we fetched them in the last 24 hours. */
  async listBanks(): Promise<Bank[]> {
    const cached = await this.readCachedBanks();
    if (cached !== null) {
      return cached;
    }

    let banks: Bank[];
    try {
      banks = await this.paystack.listBanks();
    } catch (error) {
      this.logPaystackFailure("listBanks", error);
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: "We couldn't load the list of banks. Please try again in a minute.",
      });
    }

    // Don't cache an empty list: that would hide every bank for a whole day.
    if (banks.length > 0) {
      await this.redis.set(BANKS_CACHE_KEY, JSON.stringify(banks), "EX", BANKS_CACHE_SECONDS);
    }
    return banks;
  }

  /** Who owns this account? Shown to the seller to confirm before anything is saved. */
  async resolveAccount(
    sellerId: string,
    ip: string,
    input: PayoutAccountInput,
  ): Promise<{ accountName: string; bankName: string }> {
    // Limited per seller AND per IP, so nobody can use us to look up strangers' names.
    await this.enforceLimit(
      `payouts:resolve:seller:${sellerId}`,
      RESOLVE_LIMIT,
      RESOLVE_WINDOW_SECONDS,
    );
    await this.enforceLimit(`payouts:resolve:ip:${ip}`, RESOLVE_LIMIT, RESOLVE_WINDOW_SECONDS);

    const bankName = await this.bankNameFor(input.bankCode);
    const accountName = await this.resolveWithPaystack(sellerId, input, bankName);
    return { accountName, bankName };
  }

  /**
   * Creates the seller's Paystack subaccount and saves it. Resolves the account again
   * first: the name the browser showed could be stale or made up.
   * Nothing is saved unless Paystack has confirmed both steps.
   */
  async createAccount(sellerId: string, input: PayoutAccountInput): Promise<SavedPayoutAccount> {
    await this.enforceLimit(
      `payouts:create:seller:${sellerId}`,
      CREATE_LIMIT,
      CREATE_WINDOW_SECONDS,
    );

    // Before locking: the bank list may need several slow Paystack pages on a cache miss,
    // and that must not eat into the lock's time (see CREATE_LOCK_SECONDS).
    const bankName = await this.bankNameFor(input.bankCode);

    // A lock in Redis, so a double click can't create two subaccounts at Paystack.
    // SET ... NX only sets the key if it doesn't exist yet; EX makes it expire on its own
    // if this process dies before releasing it.
    const lockKey = `payouts:create-lock:${sellerId}`;
    const lockToken = randomBytes(16).toString("hex");
    const locked = await this.redis.set(lockKey, lockToken, "EX", CREATE_LOCK_SECONDS, "NX");
    if (locked !== "OK") {
      throw new ConflictException({
        statusCode: 409,
        code: "PAYOUT_SETUP_IN_PROGRESS",
        message: "We're already setting up your payout account. Refresh in a moment.",
      });
    }

    try {
      return await this.createAccountWhileLocked(sellerId, input, bankName);
    } finally {
      // Release the lock, but only if it is still ours (it may have expired and been
      // taken by another request in the meantime).
      const holder = await this.redis.get(lockKey);
      if (holder === lockToken) {
        await this.redis.del(lockKey);
      }
    }
  }

  /** The locked part: two database queries and two Paystack calls, nothing else. */
  private async createAccountWhileLocked(
    sellerId: string,
    input: PayoutAccountInput,
    bankName: string,
  ): Promise<SavedPayoutAccount> {
    const sellerRows = await this.db
      .select({
        businessName: sellers.businessName,
        subaccountCode: sellers.paystackSubaccountCode,
      })
      .from(sellers)
      .where(eq(sellers.id, sellerId));
    const seller = sellerRows[0];
    if (!seller) {
      throw new NotFoundException("Shop not found");
    }
    // Changing bank details later is a separate feature (it must update the existing
    // subaccount, not create a second one), so for now a second account is refused.
    if (seller.subaccountCode !== null) {
      throw accountExists();
    }

    const accountName = await this.resolveWithPaystack(sellerId, input, bankName);

    let subaccountCode: string;
    try {
      const created = await this.paystack.createSubaccount({
        businessName: seller.businessName,
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
      });
      subaccountCode = created.subaccountCode;
    } catch (error) {
      this.logPaystackFailure(`createSubaccount for seller ${sellerId}`, error);
      // Only "these details are wrong" is the seller's to fix. Anything else (our key
      // refused with 401/403, Paystack down, timeout) gets the retryable answer.
      if (
        error instanceof PaystackError &&
        error.status !== undefined &&
        DETAILS_REJECTED_STATUSES.has(error.status)
      ) {
        throw new BadRequestException({
          statusCode: 400,
          message:
            "Paystack couldn't set up payouts to this account. Check the details or use another account.",
        });
      }
      throw new ServiceUnavailableException({
        statusCode: 503,
        message:
          "We couldn't reach Paystack to set up your payouts. Nothing was saved. Please try again.",
      });
    }

    const saved: SavedPayoutAccount = {
      bankName,
      accountLast4: input.accountNumber.slice(-4),
      bankAccountName: accountName,
    };

    // "IS NULL" in the WHERE: never overwrite a subaccount saved by another request.
    let updated: { id: string }[];
    try {
      updated = await this.db
        .update(sellers)
        .set({ paystackSubaccountCode: subaccountCode, ...saved })
        .where(and(eq(sellers.id, sellerId), isNull(sellers.paystackSubaccountCode)))
        .returning({ id: sellers.id });
    } catch (error) {
      // Paystack has the subaccount but we couldn't save it. Logged (the code is not secret)
      // so it can be matched up by hand; the seller can simply try again.
      // Only the error's class name is logged: a Drizzle query error's message quotes the
      // SQL parameters, which include the account holder's name and last 4 digits.
      let errorKind = "unknown error";
      if (error instanceof Error) {
        errorKind = error.name;
      }
      this.logger.error(
        `Subaccount ${subaccountCode} created for seller ${sellerId} but saving it failed (${errorKind})`,
      );
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: "We couldn't save your payout account. Please try again.",
      });
    }
    if (updated.length === 0) {
      this.logger.error(
        `Subaccount ${subaccountCode} created for seller ${sellerId}, who already had one: not saved`,
      );
      throw accountExists();
    }

    this.logger.log(`Payout account added for seller ${sellerId} (${subaccountCode})`);
    return saved;
  }

  /**
   * The bank's name for a code from our bank list. A few Paystack codes are shared by
   * two names (e.g. a bank and its new name); then both are kept, joined by " / ".
   */
  private async bankNameFor(bankCode: string): Promise<string> {
    const banks = await this.listBanks();
    const names: string[] = [];
    for (const bank of banks) {
      if (bank.code === bankCode && !names.includes(bank.name)) {
        names.push(bank.name);
      }
    }
    if (names.length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        field: "bankCode",
        message: "Choose your bank from the list",
      });
    }
    return names.join(" / ");
  }

  /** Paystack's name for the account, or a field error the seller can fix. */
  private async resolveWithPaystack(
    sellerId: string,
    input: PayoutAccountInput,
    bankName: string,
  ): Promise<string> {
    try {
      const resolved = await this.paystack.resolveAccount({
        accountNumber: input.accountNumber,
        bankCode: input.bankCode,
      });
      return resolved.accountName;
    } catch (error) {
      if (error instanceof PaystackError && error.status !== undefined) {
        if (ACCOUNT_NOT_FOUND_STATUSES.has(error.status)) {
          throw new BadRequestException({
            statusCode: 400,
            field: "accountNumber",
            message: `We couldn't find this account number at ${bankName}. Check the number and the bank.`,
          });
        }
      }
      this.logPaystackFailure(`resolveAccount for seller ${sellerId}`, error);
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: "We couldn't check this account with the bank right now. Please try again.",
      });
    }
  }

  private async readCachedBanks(): Promise<Bank[] | null> {
    const raw = await this.redis.get(BANKS_CACHE_KEY);
    if (raw === null) {
      return null;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return null;
    }
    const parsed = cachedBanksSchema.safeParse(json);
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  }

  private async enforceLimit(key: string, limit: number, windowSeconds: number) {
    const result = await this.limiter.hit(key, limit, windowSeconds);
    if (!result.allowed) {
      throw new TooManyRequestsError(result.retryAfterSeconds);
    }
  }

  /**
   * Logs only the status: error messages are kept out of the logs in case Paystack ever
   * quotes an account number back to us.
   */
  private logPaystackFailure(what: string, error: unknown) {
    if (error instanceof PaystackError) {
      let status = "no answer";
      if (error.status !== undefined) {
        status = `status ${error.status}`;
      }
      // 401/403 = Paystack refused our secret key: a setup problem someone must fix.
      if (error.status === 401 || error.status === 403) {
        this.logger.error(`Paystack ${what} failed (${status}): check PAYSTACK_SECRET_KEY`);
        return;
      }
      this.logger.warn(`Paystack ${what} failed (${status})`);
      return;
    }
    this.logger.error(`Paystack ${what} failed unexpectedly`);
  }
}

function accountExists() {
  return new ConflictException({
    statusCode: 409,
    code: "PAYOUT_ACCOUNT_EXISTS",
    message: "Your shop already has a payout account. To change it, email support@gbam.app.",
  });
}
