/**
 * Integration test against the dev Postgres and Redis db 1. Paystack is the in-memory fake
 * (FakePaystackClient): account 0000000000 fails to resolve, every other number resolves
 * to "TEST ACCOUNT". Individual tests make it fail in other ways with vi.spyOn.
 */
import "reflect-metadata";
import { sellers } from "@gbam/db";
import { FakePaystackClient, PaystackError } from "@gbam/integrations";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import type { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TooManyRequestsError } from "../common/rate-limiter.js";
import { DB, InfraModule, REDIS, type Db } from "../infra/infra.module.js";
import { IntegrationsModule, PAYSTACK } from "../integrations/integrations.module.js";
import { createTestSeller } from "../test-helpers.js";
import { BANKS_CACHE_KEY, PayoutsService } from "./payouts.service.js";
import { PayoutsModule } from "./payouts.module.js";

process.loadEnvFile?.("../../.env");

const GOOD_ACCOUNT = "0123456789";
const BAD_ACCOUNT = "0000000000"; // the fake can't resolve this one
const GTBANK = "058"; // in the fake's bank list

describe("PayoutsService (integration)", () => {
  let moduleRef: TestingModule;
  let service: PayoutsService;
  let db: Db;
  let redis: Redis;
  let paystack: FakePaystackClient;
  const sellerIds: string[] = [];
  const ips: string[] = [];

  beforeAll(async () => {
    paystack = new FakePaystackClient(
      async () => undefined,
      () => {},
    );
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, IntegrationsModule, PayoutsModule],
    })
      .overrideProvider(PAYSTACK)
      .useValue(paystack)
      .compile();
    moduleRef.enableShutdownHooks();
    service = moduleRef.get(PayoutsService);
    db = moduleRef.get(DB);
    redis = moduleRef.get<Redis>(REDIS);
    await redis.del(BANKS_CACHE_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (sellerIds.length > 0) {
      await db.delete(sellers).where(inArray(sellers.id, sellerIds));
    }
    // Rate-limit counters and locks this file created.
    const keys = [BANKS_CACHE_KEY];
    for (const id of sellerIds) {
      keys.push(
        `payouts:resolve:seller:${id}`,
        `payouts:create:seller:${id}`,
        `payouts:create-lock:${id}`,
      );
    }
    for (const ip of ips) {
      keys.push(`payouts:resolve:ip:${ip}`);
    }
    await redis.del(...keys);
    await moduleRef.close();
  });

  /** A fresh seller (so rate limits start at zero) and a fresh IP. */
  async function freshSeller() {
    const seller = await createTestSeller(db, "payout");
    sellerIds.push(seller.id);
    const ip = `test-ip-${randomUUID()}`;
    ips.push(ip);
    return { sellerId: seller.id, ip };
  }

  async function sellerRow(sellerId: string) {
    const rows = await db.select().from(sellers).where(eq(sellers.id, sellerId));
    const row = rows[0];
    if (!row) {
      throw new Error("Test seller disappeared");
    }
    return row;
  }

  /** The error a promise rejects with (fails the test if it resolves). */
  async function errorFrom(promise: Promise<unknown>): Promise<unknown> {
    try {
      await promise;
    } catch (error) {
      return error;
    }
    throw new Error("Expected the call to fail");
  }

  /** The JSON body Nest would send for an HttpException. */
  function bodyOf(error: unknown): Record<string, unknown> {
    if (!(error instanceof HttpException)) {
      throw new Error(`Expected an HttpException, got ${String(error)}`);
    }
    const body = error.getResponse();
    if (typeof body !== "object" || body === null) {
      throw new Error("Expected an object body");
    }
    return body as Record<string, unknown>;
  }

  describe("listBanks", () => {
    it("returns Paystack's banks and caches them for 24 hours", async () => {
      await redis.del(BANKS_CACHE_KEY);
      const spy = vi.spyOn(paystack, "listBanks");

      const first = await service.listBanks();
      const second = await service.listBanks();

      expect(first).toEqual(await new FakePaystackClient(async () => undefined).listBanks());
      expect(second).toEqual(first);
      expect(spy).toHaveBeenCalledTimes(1);
      const ttl = await redis.ttl(BANKS_CACHE_KEY);
      expect(ttl).toBeGreaterThan(24 * 60 * 60 - 60);
      expect(ttl).toBeLessThanOrEqual(24 * 60 * 60);
    });

    it("says the list is unavailable (503) when Paystack fails and nothing is cached", async () => {
      await redis.del(BANKS_CACHE_KEY);
      vi.spyOn(paystack, "listBanks").mockRejectedValue(new PaystackError("down", 500));

      const error = await errorFrom(service.listBanks());

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(await redis.exists(BANKS_CACHE_KEY)).toBe(0);
    });
  });

  describe("resolveAccount", () => {
    it("returns the account name and bank name", async () => {
      const { sellerId, ip } = await freshSeller();
      const result = await service.resolveAccount(sellerId, ip, {
        bankCode: GTBANK,
        accountNumber: GOOD_ACCOUNT,
      });
      expect(result).toEqual({ accountName: "TEST ACCOUNT", bankName: "Guaranty Trust Bank" });
    });

    it("rejects an account Paystack can't resolve as an accountNumber error, changing nothing", async () => {
      const { sellerId, ip } = await freshSeller();
      const before = await sellerRow(sellerId);

      const error = await errorFrom(
        service.resolveAccount(sellerId, ip, { bankCode: GTBANK, accountNumber: BAD_ACCOUNT }),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(bodyOf(error).field).toBe("accountNumber");
      expect(JSON.stringify(bodyOf(error))).not.toContain(BAD_ACCOUNT);
      expect(await sellerRow(sellerId)).toEqual(before);
    });

    it("rejects a bank code that isn't in the bank list without asking Paystack", async () => {
      const { sellerId, ip } = await freshSeller();
      const spy = vi.spyOn(paystack, "resolveAccount");

      const error = await errorFrom(
        service.resolveAccount(sellerId, ip, { bankCode: "999999", accountNumber: GOOD_ACCOUNT }),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(bodyOf(error).field).toBe("bankCode");
      expect(spy).not.toHaveBeenCalled();
    });

    it("reports a Paystack outage as retryable (503), not as a wrong account number", async () => {
      const { sellerId, ip } = await freshSeller();
      vi.spyOn(paystack, "resolveAccount").mockRejectedValue(
        new PaystackError("Paystack /bank/resolve did not answer"),
      );

      const error = await errorFrom(
        service.resolveAccount(sellerId, ip, { bankCode: GTBANK, accountNumber: GOOD_ACCOUNT }),
      );

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(bodyOf(error).field).toBeUndefined();
    });

    it("allows 10 checks per 10 minutes per seller", async () => {
      const { sellerId } = await freshSeller();
      const input = { bankCode: GTBANK, accountNumber: GOOD_ACCOUNT };
      for (let i = 0; i < 10; i++) {
        // A different IP each time, so only the per-seller limit applies.
        const ip = `test-ip-${randomUUID()}`;
        ips.push(ip);
        await service.resolveAccount(sellerId, ip, input);
      }
      const lastIp = `test-ip-${randomUUID()}`;
      ips.push(lastIp);

      const error = await errorFrom(service.resolveAccount(sellerId, lastIp, input));

      expect(error).toBeInstanceOf(TooManyRequestsError);
      expect(await redis.ttl(`payouts:resolve:seller:${sellerId}`)).toBeLessThanOrEqual(600);
    });

    it("allows 10 checks per 10 minutes per IP, across sellers", async () => {
      const { ip } = await freshSeller();
      const input = { bankCode: GTBANK, accountNumber: GOOD_ACCOUNT };
      for (let i = 0; i < 10; i++) {
        const other = await freshSeller();
        await service.resolveAccount(other.sellerId, ip, input);
      }
      const last = await freshSeller();

      const error = await errorFrom(service.resolveAccount(last.sellerId, ip, input));

      expect(error).toBeInstanceOf(TooManyRequestsError);
    });
  });

  describe("createAccount", () => {
    it("creates the subaccount and stores its code, bank name, last 4 digits and account name only", async () => {
      const { sellerId } = await freshSeller();
      const createSpy = vi.spyOn(paystack, "createSubaccount");

      const result = await service.createAccount(sellerId, {
        bankCode: GTBANK,
        accountNumber: GOOD_ACCOUNT,
      });

      expect(result).toEqual({
        bankName: "Guaranty Trust Bank",
        accountLast4: "6789",
        bankAccountName: "TEST ACCOUNT",
      });
      const row = await sellerRow(sellerId);
      expect(row.paystackSubaccountCode).toMatch(/^ACCT_fake_/);
      expect(row.bankName).toBe("Guaranty Trust Bank");
      expect(row.accountLast4).toBe("6789");
      expect(row.bankAccountName).toBe("TEST ACCOUNT");
      expect(createSpy).toHaveBeenCalledWith({
        businessName: row.businessName,
        bankCode: GTBANK,
        accountNumber: GOOD_ACCOUNT,
      });

      // The full account number is nowhere in the database row or in Redis keys.
      expect(JSON.stringify(row)).not.toContain(GOOD_ACCOUNT);
      const redisKeys = await redis.keys(`*${GOOD_ACCOUNT}*`);
      expect(redisKeys).toEqual([]);
    });

    it("checks the account again with Paystack instead of trusting the browser", async () => {
      const { sellerId } = await freshSeller();
      const resolveSpy = vi.spyOn(paystack, "resolveAccount");
      const createSpy = vi.spyOn(paystack, "createSubaccount");
      const before = await sellerRow(sellerId);

      const error = await errorFrom(
        service.createAccount(sellerId, { bankCode: GTBANK, accountNumber: BAD_ACCOUNT }),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(bodyOf(error).field).toBe("accountNumber");
      expect(resolveSpy).toHaveBeenCalledTimes(1);
      expect(createSpy).not.toHaveBeenCalled();
      expect(await sellerRow(sellerId)).toEqual(before);
    });

    it("saves nothing when creating the subaccount fails", async () => {
      const { sellerId } = await freshSeller();
      vi.spyOn(paystack, "createSubaccount").mockRejectedValue(
        new PaystackError("Something went wrong", 500),
      );
      const before = await sellerRow(sellerId);

      const error = await errorFrom(
        service.createAccount(sellerId, { bankCode: GTBANK, accountNumber: GOOD_ACCOUNT }),
      );

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(await sellerRow(sellerId)).toEqual(before);
    });

    it("lets the seller try again after a failure (the lock is released)", async () => {
      const { sellerId } = await freshSeller();
      vi.spyOn(paystack, "createSubaccount").mockRejectedValueOnce(
        new PaystackError("Something went wrong", 500),
      );
      const input = { bankCode: GTBANK, accountNumber: GOOD_ACCOUNT };

      await errorFrom(service.createAccount(sellerId, input));
      await service.createAccount(sellerId, input);

      expect((await sellerRow(sellerId)).paystackSubaccountCode).toMatch(/^ACCT_fake_/);
    });

    it("refuses a second payout account (409 PAYOUT_ACCOUNT_EXISTS) without calling Paystack", async () => {
      const { sellerId } = await freshSeller();
      const input = { bankCode: GTBANK, accountNumber: GOOD_ACCOUNT };
      await service.createAccount(sellerId, input);
      const saved = await sellerRow(sellerId);
      const createSpy = vi.spyOn(paystack, "createSubaccount");

      const error = await errorFrom(
        service.createAccount(sellerId, { bankCode: "044", accountNumber: "9876543210" }),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect(bodyOf(error).code).toBe("PAYOUT_ACCOUNT_EXISTS");
      expect(createSpy).not.toHaveBeenCalled();
      expect(await sellerRow(sellerId)).toEqual(saved);
    });

    it("creates only one subaccount when two requests race", async () => {
      const { sellerId } = await freshSeller();
      const createSpy = vi.spyOn(paystack, "createSubaccount");
      const input = { bankCode: GTBANK, accountNumber: GOOD_ACCOUNT };

      const results = await Promise.allSettled([
        service.createAccount(sellerId, input),
        service.createAccount(sellerId, input),
      ]);

      let fulfilled = 0;
      for (const result of results) {
        if (result.status === "fulfilled") {
          fulfilled = fulfilled + 1;
        } else {
          expect(result.reason).toBeInstanceOf(ConflictException);
        }
      }
      expect(fulfilled).toBe(1);
      expect(createSpy).toHaveBeenCalledTimes(1);
    });

    it("allows 5 attempts per day per seller", async () => {
      const { sellerId } = await freshSeller();
      for (let i = 0; i < 5; i++) {
        await errorFrom(
          service.createAccount(sellerId, { bankCode: GTBANK, accountNumber: BAD_ACCOUNT }),
        );
      }

      const error = await errorFrom(
        service.createAccount(sellerId, { bankCode: GTBANK, accountNumber: GOOD_ACCOUNT }),
      );

      expect(error).toBeInstanceOf(TooManyRequestsError);
      expect(await redis.ttl(`payouts:create:seller:${sellerId}`)).toBeGreaterThan(23 * 60 * 60);
      expect((await sellerRow(sellerId)).paystackSubaccountCode).toBeNull();
    });
  });
});
