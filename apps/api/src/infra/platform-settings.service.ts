import { platformSettings } from "@gbam/db";
import {
  DEFAULT_PLATFORM_SETTINGS,
  MAINTENANCE_OFF,
  maintenanceSchema,
  platformSettingsSchema,
  type Maintenance,
  type PlatformSettings,
  type PublicPlatformInfo,
} from "@gbam/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DB, type Db } from "./tokens.js";

/**
 * Prefix for this process's settings rows. Empty in the app; tests use their own prefix so
 * changing settings in one test can't affect another test running at the same time.
 */
export const PLATFORM_SETTINGS_NAMESPACE = Symbol("PLATFORM_SETTINGS_NAMESPACE");

/** How long a value read from the database is reused before reading it again. */
const CACHE_MS = 30_000;
/** Maintenance is checked on every request, but a change must apply quickly. */
const MAINTENANCE_CACHE_MS = 10_000;

type Cached<T> = { value: T; readAt: number };

/**
 * Reads Admin → Settings (the platform_settings table). Values are kept in memory for a
 * short while ("cached") because they're read on many requests; a change made in another
 * process is picked up within 30 seconds (10 for maintenance). Saving is done by the admin
 * area (SettingsAdminService), which then calls clearCache().
 */
@Injectable()
export class PlatformSettingsService {
  private readonly logger = new Logger(PlatformSettingsService.name);
  private settingsCache: Cached<PlatformSettings> | null = null;
  private maintenanceCache: Cached<Maintenance> | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PLATFORM_SETTINGS_NAMESPACE) private readonly namespace: string,
  ) {}

  /** The database key for "settings" or "maintenance" (with this process's prefix). */
  keyFor(name: "settings" | "maintenance"): string {
    return `${this.namespace}${name}`;
  }

  async get(): Promise<PlatformSettings> {
    const now = Date.now();
    if (this.settingsCache && now - this.settingsCache.readAt < CACHE_MS) {
      return this.settingsCache.value;
    }
    const stored = await this.read("settings");
    let value = DEFAULT_PLATFORM_SETTINGS;
    if (stored !== null) {
      // Missing fields (a setting added after this row was saved) fall back to the default.
      const parsed = platformSettingsSchema.safeParse({ ...DEFAULT_PLATFORM_SETTINGS, ...stored });
      if (parsed.success) {
        value = parsed.data;
      } else {
        this.logger.error("Stored platform settings are invalid; using the defaults");
      }
    }
    this.settingsCache = { value, readAt: now };
    return value;
  }

  async maintenance(): Promise<Maintenance> {
    const now = Date.now();
    if (this.maintenanceCache && now - this.maintenanceCache.readAt < MAINTENANCE_CACHE_MS) {
      return this.maintenanceCache.value;
    }
    const stored = await this.read("maintenance");
    let value = MAINTENANCE_OFF;
    if (stored !== null) {
      const parsed = maintenanceSchema.safeParse(stored);
      if (parsed.success) {
        value = parsed.data;
      }
    }
    this.maintenanceCache = { value, readAt: now };
    return value;
  }

  /** What the website may know (GET /platform/public). */
  async publicInfo(): Promise<PublicPlatformInfo> {
    const settings = await this.get();
    return {
      whatsappNumber: settings.whatsappNumber,
      signupsOpen: settings.signupsOpen,
      feePercentBasisPoints: settings.feePercentBasisPoints,
      feeCapKobo: settings.feeCapKobo,
      maintenance: await this.maintenance(),
    };
  }

  /** Forget cached values, so the next read sees a change saved just now. */
  clearCache(): void {
    this.settingsCache = null;
    this.maintenanceCache = null;
  }

  private async read(name: "settings" | "maintenance"): Promise<unknown> {
    const rows = await this.db
      .select({ value: platformSettings.value })
      .from(platformSettings)
      .where(eq(platformSettings.key, this.keyFor(name)));
    const row = rows[0];
    if (!row) {
      return null;
    }
    return row.value;
  }
}
