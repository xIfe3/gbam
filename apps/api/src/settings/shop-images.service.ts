import { sellers } from "@gbam/db";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { RateLimiter, TooManyRequestsError } from "../common/rate-limiter.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { InjectPhotoStorage, type PhotoStorage } from "../integrations/integrations.module.js";
import {
  processShopImage,
  UnsupportedPhotoError,
  type ShopImageKind,
} from "../products/photo-processing.js";

const MAX_BYTES = 10 * 1024 * 1024;
const UPLOADS_PER_HOUR = 30;

/** The photo storage address of a saved key, or null when there's none. */
export function shopImageUrl(storage: PhotoStorage, key: string | null): string | null {
  if (key === null) {
    return null;
  }
  return storage.publicUrl(key);
}

/**
 * The shop's logo (shown round, on the shop page and in the dashboard) and banner (across
 * the top of the shop page). Without them the shop shows its initials and a gbam pattern.
 */
@Injectable()
export class ShopImagesService {
  private readonly logger = new Logger(ShopImagesService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    @InjectPhotoStorage() private readonly storage: PhotoStorage,
    private readonly limiter: RateLimiter,
  ) {}

  async upload(sellerId: string, kind: ShopImageKind, file: { buffer: Buffer; size: number }) {
    if (file.size > MAX_BYTES) {
      throw new BadRequestException("Photos can be up to 10 MB");
    }
    // Resizing is the expensive part, so the limit is checked before it.
    const hit = await this.limiter.hit(`shop-image:${sellerId}`, UPLOADS_PER_HOUR, 60 * 60);
    if (!hit.allowed) {
      throw new TooManyRequestsError(hit.retryAfterSeconds);
    }
    let processed: Buffer;
    try {
      processed = await processShopImage(file.buffer, kind);
    } catch (error) {
      if (error instanceof UnsupportedPhotoError) {
        throw new BadRequestException("We can't read this photo. Try a JPEG or PNG.");
      }
      throw error;
    }

    const previous = await this.currentKey(sellerId, kind);
    const key = `shops/${sellerId}/${kind}-${randomUUID()}.webp`;
    await this.storage.put(key, processed, "image/webp");
    await this.saveKey(sellerId, kind, key);
    if (previous) {
      await this.deleteFile(previous);
    }
    return { url: this.storage.publicUrl(key) };
  }

  /** Back to the default look (initials or the gbam pattern). */
  async remove(sellerId: string, kind: ShopImageKind) {
    const previous = await this.currentKey(sellerId, kind);
    await this.saveKey(sellerId, kind, null);
    if (previous) {
      await this.deleteFile(previous);
    }
    return { ok: true };
  }

  private async currentKey(sellerId: string, kind: ShopImageKind): Promise<string | null> {
    const rows = await this.db
      .select({ logoKey: sellers.logoKey, bannerKey: sellers.bannerKey })
      .from(sellers)
      .where(eq(sellers.id, sellerId));
    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Shop not found");
    }
    if (kind === "logo") {
      return row.logoKey;
    }
    return row.bannerKey;
  }

  private async saveKey(sellerId: string, kind: ShopImageKind, key: string | null) {
    if (kind === "logo") {
      await this.db.update(sellers).set({ logoKey: key }).where(eq(sellers.id, sellerId));
    } else {
      await this.db.update(sellers).set({ bannerKey: key }).where(eq(sellers.id, sellerId));
    }
  }

  /** The old file isn't needed any more. If deleting fails, it's only a leftover file. */
  private async deleteFile(key: string) {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.warn(`Could not delete old shop image ${key}: ${String(error)}`);
    }
  }
}
