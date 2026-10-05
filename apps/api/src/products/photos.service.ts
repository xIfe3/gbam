import { productImages } from "@gbam/db";
import { PRODUCT_LIMITS } from "@gbam/shared";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { and, eq, isNull, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { RateLimiter, TooManyRequestsError } from "../common/rate-limiter.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { InjectPhotoStorage, type PhotoStorage } from "../integrations/integrations.module.js";
import { processPhoto, UnsupportedPhotoError } from "./photo-processing.js";

const UPLOADS_PER_HOUR = 60;
const ONE_HOUR_SECONDS = 60 * 60;

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    @InjectPhotoStorage() private readonly storage: PhotoStorage,
    private readonly limiter: RateLimiter,
  ) {}

  async upload(
    sellerId: string,
    file: { buffer: Buffer; size: number },
  ): Promise<{ id: string; smallUrl: string }> {
    if (file.size > PRODUCT_LIMITS.maxPhotoBytes) {
      throw new PayloadTooLargeException("Photos can be up to 10 MB");
    }

    // Resizing is the expensive part, so the limit is checked before it.
    const hit = await this.limiter.hit(
      `photo-upload:${sellerId}`,
      UPLOADS_PER_HOUR,
      ONE_HOUR_SECONDS,
    );
    if (!hit.allowed) {
      throw new TooManyRequestsError(hit.retryAfterSeconds);
    }

    let processed;
    try {
      processed = await processPhoto(file.buffer);
    } catch (error) {
      if (error instanceof UnsupportedPhotoError) {
        throw new BadRequestException("We can't read this photo. Try a JPEG or PNG.");
      }
      throw error;
    }

    const baseName = `${sellerId}/${randomUUID()}`;
    const largeKey = `${baseName}-l.webp`;
    const smallKey = `${baseName}-s.webp`;

    await this.storage.put(largeKey, processed.large, "image/webp");
    await this.storage.put(smallKey, processed.small, "image/webp");

    // productId stays null: the photo is "unattached" until a product claims it.
    // If the insert fails we remove the files so they are not left behind.
    let row;
    try {
      const inserted = await this.db
        .insert(productImages)
        .values({
          sellerId,
          productId: null,
          largeKey,
          smallKey,
          width: processed.width,
          height: processed.height,
        })
        .returning();
      row = inserted[0];
    } catch (error) {
      await this.deleteFiles([largeKey, smallKey]);
      throw error;
    }
    if (!row) {
      await this.deleteFiles([largeKey, smallKey]);
      throw new Error("Photo row was not saved");
    }

    return { id: row.id, smallUrl: this.storage.publicUrl(smallKey) };
  }

  /** Removes an uploaded photo that no product uses yet (the seller changed their mind). */
  async deleteUnattached(sellerId: string, imageId: string): Promise<void> {
    // One DELETE with every condition in WHERE: if a product attaches the photo at the
    // same moment, this matches nothing instead of deleting a photo in use.
    const removed = await this.db
      .delete(productImages)
      .where(
        and(
          eq(productImages.id, imageId),
          eq(productImages.sellerId, sellerId),
          isNull(productImages.productId),
        ),
      )
      .returning();
    const image = removed[0];
    if (!image) {
      throw new NotFoundException("Photo not found");
    }
    // Files go after the row, so a failure can only leave an orphan file, never a
    // row that points at a missing file.
    await this.deleteFiles([image.largeKey, image.smallKey]);
  }

  /** An orphaned file costs a little storage, so a failure is logged, not thrown. */
  async deleteFiles(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.storage.delete(key);
      } catch (error) {
        this.logger.warn(`Could not delete photo file ${key}: ${String(error)}`);
      }
    }
  }

  /** Deletes unattached photos uploaded before `olderThan`. Returns how many. */
  async cleanupOrphans(olderThan: Date): Promise<number> {
    const removed = await this.db
      .delete(productImages)
      .where(and(isNull(productImages.productId), lt(productImages.createdAt, olderThan)))
      .returning();

    for (const image of removed) {
      await this.deleteFiles([image.largeKey, image.smallKey]);
    }
    return removed.length;
  }

  urlsFor(image: { largeKey: string; smallKey: string }): { large: string; small: string } {
    return {
      large: this.storage.publicUrl(image.largeKey),
      small: this.storage.publicUrl(image.smallKey),
    };
  }
}
