import { dailyVisits, sellers } from "@gbam/db";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import type { Redis } from "ioredis";
import { InjectDb, REDIS, type Db } from "../infra/infra.module.js";

export const BEAT_KINDS = ["storefront", "product", "checkout", "dashboard", "admin"] as const;
export type BeatKind = (typeof BEAT_KINDS)[number];

export type Beat = { tabId: string; kind: BeatKind; shop?: string; first: boolean };

/** Someone counts as "active" for 2 minutes after their last beat (pages beat every minute). */
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
/** Daily counters are copied to the database every 15 minutes; keep them a few days anyway. */
const VISITS_TTL_SECONDS = 3 * 24 * 60 * 60;
const BOT = /bot|crawl|spider|slurp|preview|monitor|headless/i;
/** Kinds that count as a shop visit (the dashboard and admin area don't). */
const SHOP_KINDS: BeatKind[] = ["storefront", "product", "checkout"];

/** Today's date in Lagos (UTC+1), "YYYY-MM-DD". */
export function lagosDay(now: Date): string {
  return new Date(now.getTime() + 3_600_000).toISOString().slice(0, 10);
}

/**
 * Counts visits and who is active right now, from the page beacon. Only counts are kept: no
 * cookies, no IP addresses, no user ids. The tab id is a random string the page makes for
 * itself and is only used to avoid counting the same tab twice.
 *
 * Redis "sorted sets" (ZADD) keep each active tab with the time of its last beat, so old ones
 * can be dropped by time; a "hash" (HINCRBY) keeps one counter per shop and page kind per day.
 */
@Injectable()
export class VisitsService {
  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async beat(beat: Beat, userAgent: string | undefined): Promise<void> {
    if (userAgent === undefined || BOT.test(userAgent)) {
      return;
    }
    // "SET ... NX EX 60": only the first beat from this tab in a minute does anything, so a
    // page (or someone) sending beats in a loop can't inflate the numbers.
    const firstThisMinute = await this.redis.set(
      `beat:${beat.tabId}:${beat.kind}`,
      "1",
      "EX",
      60,
      "NX",
    );
    if (firstThisMinute === null) {
      return;
    }

    let sellerId: string | null = null;
    if (beat.shop) {
      sellerId = await this.sellerIdFor(beat.shop);
    }
    let shopLabel = "-";
    if (beat.shop && sellerId !== null) {
      shopLabel = beat.shop;
    }

    const now = Date.now();
    const activeKey = `active:${beat.kind}`;
    await this.redis.zadd(activeKey, now, `${beat.tabId}|${shopLabel}`);
    // Drop tabs gone quiet for 2 minutes here too, not only when an admin looks, so the set
    // stays small even if nobody opens the Analytics page for weeks.
    await this.redis.zremrangebyscore(activeKey, 0, now - ACTIVE_WINDOW_MS);

    if (beat.first && sellerId !== null && SHOP_KINDS.includes(beat.kind)) {
      const key = `visits:${lagosDay(new Date(now))}`;
      await this.redis.hincrby(key, `${sellerId}:${beat.kind}`, 1);
      await this.redis.expire(key, VISITS_TTL_SECONDS);
    }
  }

  /** Who is active in the last 2 minutes. */
  async active() {
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    const counts: Record<BeatKind, number> = {
      storefront: 0,
      product: 0,
      checkout: 0,
      dashboard: 0,
      admin: 0,
    };
    const shopCounts = new Map<string, number>();
    for (const kind of BEAT_KINDS) {
      const key = `active:${kind}`;
      // Drop tabs that haven't beaten in 2 minutes, then read the rest.
      await this.redis.zremrangebyscore(key, 0, cutoff);
      const members = await this.redis.zrange(key, "0", "-1");
      counts[kind] = members.length;
      if (SHOP_KINDS.includes(kind)) {
        for (const member of members) {
          const slug = member.split("|")[1] ?? "-";
          if (slug !== "-") {
            shopCounts.set(slug, (shopCounts.get(slug) ?? 0) + 1);
          }
        }
      }
    }

    const topShops: { slug: string; count: number }[] = [];
    for (const [slug, count] of shopCounts) {
      topShops.push({ slug, count });
    }
    topShops.sort((a, b) => b.count - a.count);

    return {
      sellersInDashboard: counts.dashboard,
      shoppers: counts.storefront + counts.product,
      checkout: counts.checkout,
      admins: counts.admin,
      topShops: topShops.slice(0, 10),
    };
  }

  /** The shop's id, or null for an unknown or deleted shop. */
  private async sellerIdFor(slug: string): Promise<string | null> {
    const rows = await this.db
      .select({ id: sellers.id })
      .from(sellers)
      .where(and(eq(sellers.slug, slug), isNull(sellers.closedAt)));
    const row = rows[0];
    if (!row) {
      return null;
    }
    return row.id;
  }

  /**
   * Copies one day's counters from Redis into daily_visits. Safe to run again and again: each
   * row is set to the current count ("upsert"), never added to, so nothing is counted twice.
   */
  async copyDay(day: string): Promise<void> {
    const counters = await this.redis.hgetall(`visits:${day}`);
    for (const [field, value] of Object.entries(counters)) {
      // field is "{sellerId}:{kind}"
      const [sellerId, kind] = field.split(":");
      if (!sellerId || !kind) {
        continue;
      }
      const visits = Number(value);
      try {
        await this.db
          .insert(dailyVisits)
          .values({ day, sellerId, kind, visits })
          .onConflictDoUpdate({
            target: [dailyVisits.day, dailyVisits.sellerId, dailyVisits.kind],
            set: { visits },
          });
      } catch {
        // The shop was deleted since (its id no longer exists): nothing to keep.
      }
    }
  }

  /** Copies yesterday and today (yesterday too, for visits in the last minutes before midnight). */
  async copyRecent(now: Date): Promise<string[]> {
    const days = [lagosDay(new Date(now.getTime() - 86_400_000)), lagosDay(now)];
    for (const day of days) {
      await this.copyDay(day);
    }
    return days;
  }
}
