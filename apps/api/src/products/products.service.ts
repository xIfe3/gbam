import { orderItems, productImages, productOptions, productVariants, products, sellers } from "@gbam/db";
import {
  variantTitle,
  type ProductInput,
  type ProductStatus,
  type UpdateProductInput,
} from "@gbam/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { PhotosService } from "./photos.service.js";
import { assertImagesUsable, imageIdsError, uniqueSlug, type Tx } from "./product-rules.js";

const STALE_MESSAGE = "This product changed since you opened it. Reload to see the latest.";

export type ProductListItem = {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  mainPhotoUrl: string | null;
  minPriceKobo: number;
  maxPriceKobo: number;
  variantCount: number;
  /** null when no enabled variant tracks its stock. */
  totalStock: number | null;
};

export type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  version: number;
  images: { id: string; position: number; largeUrl: string; smallUrl: string }[];
  options: { name: string; values: string[] }[];
  variants: {
    id: string;
    optionValues: string[];
    title: string;
    priceKobo: number;
    stock: number | null;
    imageId: string | null;
    isEnabled: boolean;
  }[];
};

type VariantInput = ProductInput["variants"][number];

// The description is optional in the input; the column stores "no description" as null.
function descriptionOf(input: ProductInput): string | null {
  if (input.description === undefined) {
    return null;
  }
  return input.description;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly photos: PhotosService,
  ) {}

  async list(sellerId: string): Promise<ProductListItem[]> {
    const productRows = await this.db
      .select()
      .from(products)
      .where(and(eq(products.sellerId, sellerId), ne(products.status, "archived")))
      .orderBy(desc(products.createdAt));
    if (productRows.length === 0) {
      return [];
    }

    const productIds: string[] = [];
    for (const product of productRows) {
      productIds.push(product.id);
    }

    const variantRows = await this.db
      .select()
      .from(productVariants)
      .where(
        and(
          inArray(productVariants.productId, productIds),
          isNull(productVariants.archivedAt),
          eq(productVariants.isEnabled, true),
        ),
      );
    const imageRows = await this.db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(asc(productImages.position));

    // The first image of each product is its main photo (rows are already in position order).
    const mainImages = new Map<string, { largeKey: string; smallKey: string }>();
    for (const image of imageRows) {
      if (image.productId !== null && !mainImages.has(image.productId)) {
        mainImages.set(image.productId, image);
      }
    }

    const items: ProductListItem[] = [];
    for (const product of productRows) {
      let minPrice = 0;
      let maxPrice = 0;
      let count = 0;
      let totalStock = 0;
      let anyTracked = false;
      for (const variant of variantRows) {
        if (variant.productId !== product.id) {
          continue;
        }
        if (count === 0 || variant.priceKobo < minPrice) {
          minPrice = variant.priceKobo;
        }
        if (count === 0 || variant.priceKobo > maxPrice) {
          maxPrice = variant.priceKobo;
        }
        count = count + 1;
        if (variant.stock !== null) {
          anyTracked = true;
          totalStock = totalStock + variant.stock;
        }
      }

      let mainPhotoUrl: string | null = null;
      const main = mainImages.get(product.id);
      if (main) {
        mainPhotoUrl = this.photos.urlsFor(main).small;
      }
      let stockTotal: number | null = null;
      if (anyTracked) {
        stockTotal = totalStock;
      }

      items.push({
        id: product.id,
        slug: product.slug,
        name: product.name,
        status: product.status,
        mainPhotoUrl,
        minPriceKobo: minPrice,
        maxPriceKobo: maxPrice,
        variantCount: count,
        totalStock: stockTotal,
      });
    }
    return items;
  }

  async get(sellerId: string, productId: string): Promise<ProductDetail> {
    const productRows = await this.db
      .select()
      .from(products)
      .where(and(eq(products.id, productId), eq(products.sellerId, sellerId)));
    const product = productRows[0];
    if (!product || product.status === "archived") {
      throw new NotFoundException("Product not found");
    }

    const imageRows = await this.db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(asc(productImages.position));
    const optionRows = await this.db
      .select()
      .from(productOptions)
      .where(eq(productOptions.productId, productId))
      .orderBy(asc(productOptions.position));
    // Archived variants are only kept for old orders, so the seller never sees them.
    const variantRows = await this.db
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.productId, productId), isNull(productVariants.archivedAt)))
      .orderBy(asc(productVariants.position));

    const images: ProductDetail["images"] = [];
    for (const image of imageRows) {
      const urls = this.photos.urlsFor(image);
      images.push({
        id: image.id,
        position: image.position,
        largeUrl: urls.large,
        smallUrl: urls.small,
      });
    }
    const options: ProductDetail["options"] = [];
    for (const option of optionRows) {
      options.push({ name: option.name, values: option.values });
    }
    const variants: ProductDetail["variants"] = [];
    for (const variant of variantRows) {
      variants.push({
        id: variant.id,
        optionValues: variant.optionValues,
        title: variant.title,
        priceKobo: variant.priceKobo,
        stock: variant.stock,
        imageId: variant.imageId,
        isEnabled: variant.isEnabled,
      });
    }

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      status: product.status,
      version: product.version,
      images,
      options,
      variants,
    };
  }

  async create(sellerId: string, input: ProductInput): Promise<ProductDetail> {
    // A transaction: the product, options, variants and photo links are saved together
    // or not at all, so a failure half-way never leaves a product without variants.
    const productId = await this.db.transaction(async (tx) => {
      // Locks this seller's row so two creates with the same name can't both pick the
      // same slug. "no key update" still lets other inserts that point at the seller run.
      await tx
        .select({ id: sellers.id })
        .from(sellers)
        .where(eq(sellers.id, sellerId))
        .for("no key update");

      await assertImagesUsable(tx, sellerId, input.imageIds, null);
      const slug = await uniqueSlug(tx, sellerId, input.name);

      const firstVariant = input.variants[0];
      if (!firstVariant) {
        throw new BadRequestException("A product needs at least one variant");
      }

      // priceKobo / stock / isActive are the old single-price columns, still read by
      // older code until they are removed. They mirror the first variant.
      const inserted = await tx
        .insert(products)
        .values({
          sellerId,
          name: input.name,
          slug,
          description: descriptionOf(input),
          status: "active",
          priceKobo: firstVariant.priceKobo,
          stock: firstVariant.stock,
          isActive: true,
        })
        .returning({ id: products.id });
      const row = inserted[0];
      if (!row) {
        throw new Error("Failed to create the product");
      }

      await this.insertOptions(tx, row.id, input.options);
      await this.attachImages(tx, sellerId, row.id, input.imageIds);
      for (let i = 0; i < input.variants.length; i++) {
        const variant = input.variants[i];
        if (variant) {
          await this.insertVariant(tx, row.id, variant, i);
        }
      }
      return row.id;
    });

    return this.get(sellerId, productId);
  }

  async update(
    sellerId: string,
    productId: string,
    input: UpdateProductInput,
  ): Promise<ProductDetail> {
    const removedKeys = await this.db.transaction(async (tx) => {
      // Row lock: a second save of the same product waits here until this one commits,
      // so the version check below can't be fooled by two saves running at once.
      const locked = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, productId), eq(products.sellerId, sellerId)))
        .for("update");
      const product = locked[0];
      if (!product || product.status === "archived") {
        throw new NotFoundException("Product not found");
      }
      // Optimistic version check: the seller opened version N; if the row has moved on,
      // someone else (or another tab) saved in between.
      if (product.version !== input.version) {
        throw new ConflictException(STALE_MESSAGE);
      }

      await assertImagesUsable(tx, sellerId, input.imageIds, productId);

      const firstVariant = input.variants[0];
      if (!firstVariant) {
        throw new BadRequestException("A product needs at least one variant");
      }

      // The slug is never touched: links to the product must keep working after a rename.
      await tx
        .update(products)
        .set({
          name: input.name,
          description: descriptionOf(input),
          priceKobo: firstVariant.priceKobo,
          stock: firstVariant.stock,
          version: product.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));

      await tx.delete(productOptions).where(eq(productOptions.productId, productId));
      await this.insertOptions(tx, productId, input.options);

      const removed = await this.syncImages(tx, sellerId, productId, input.imageIds);
      await this.syncVariants(tx, productId, input.variants);
      return removed;
    });

    // Files are removed only after the commit: if the save had failed, the photos must
    // still be there. A failure here is logged by PhotosService and leaves harmless orphans.
    await this.photos.deleteFiles(removedKeys);

    return this.get(sellerId, productId);
  }

  // Only active/hidden: archiving happens through remove(), and archived products
  // can't be brought back, so they count as not found here.
  async setStatus(
    sellerId: string,
    productId: string,
    status: "active" | "hidden",
  ): Promise<void> {
    const updated = await this.db
      .update(products)
      .set({ status, isActive: status === "active", updatedAt: new Date() })
      .where(
        and(
          eq(products.id, productId),
          eq(products.sellerId, sellerId),
          ne(products.status, "archived"),
        ),
      )
      .returning({ id: products.id });
    if (updated.length === 0) {
      throw new NotFoundException("Product not found");
    }
  }

  async remove(sellerId: string, productId: string): Promise<{ archived: boolean }> {
    const result = await this.db.transaction(async (tx) => {
      const locked = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.sellerId, sellerId)))
        .for("update");
      if (locked.length === 0) {
        throw new NotFoundException("Product not found");
      }

      const ordered = await tx
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(eq(orderItems.productId, productId))
        .limit(1);
      if (ordered.length > 0) {
        // Old orders still point at this product, so it is hidden from every list
        // instead of deleted.
        await tx
          .update(products)
          .set({ status: "archived", isActive: false, updatedAt: new Date() })
          .where(eq(products.id, productId));
        const noKeys: string[] = [];
        return { archived: true, keys: noKeys };
      }

      const imageRows = await tx
        .select({ largeKey: productImages.largeKey, smallKey: productImages.smallKey })
        .from(productImages)
        .where(eq(productImages.productId, productId));
      const keys: string[] = [];
      for (const image of imageRows) {
        keys.push(image.largeKey, image.smallKey);
      }
      // Options, variants and image rows go with it (ON DELETE CASCADE).
      await tx.delete(products).where(eq(products.id, productId));
      return { archived: false, keys };
    });

    await this.photos.deleteFiles(result.keys);
    return { archived: result.archived };
  }

  private async insertOptions(
    tx: Tx,
    productId: string,
    options: ProductInput["options"],
  ): Promise<void> {
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      if (option) {
        await tx
          .insert(productOptions)
          .values({ productId, name: option.name, values: option.values, position: i });
      }
    }
  }

  private async insertVariant(
    tx: Tx,
    productId: string,
    variant: VariantInput,
    position: number,
  ): Promise<void> {
    await tx.insert(productVariants).values({
      productId,
      position,
      optionValues: variant.optionValues,
      title: variantTitle(variant.optionValues),
      priceKobo: variant.priceKobo,
      stock: variant.stock,
      imageId: variant.imageId,
      isEnabled: variant.isEnabled,
    });
  }

  /** Links the photos to the product. Positions start at 1: position 1 is the main photo. */
  private async attachImages(
    tx: Tx,
    sellerId: string,
    productId: string,
    imageIds: string[],
  ): Promise<void> {
    for (let i = 0; i < imageIds.length; i++) {
      const imageId = imageIds[i];
      if (!imageId) {
        continue;
      }
      // The WHERE repeats the "free or already mine" rule, so a photo claimed by another
      // save at the same moment is refused instead of stolen.
      const updated = await tx
        .update(productImages)
        .set({ productId, position: i + 1 })
        .where(
          and(
            eq(productImages.id, imageId),
            eq(productImages.sellerId, sellerId),
            or(isNull(productImages.productId), eq(productImages.productId, productId)),
          ),
        )
        .returning({ id: productImages.id });
      if (updated.length === 0) {
        throw imageIdsError();
      }
    }
  }

  /** Deletes photos that were dropped, attaches the listed ones, returns the dropped files' keys. */
  private async syncImages(
    tx: Tx,
    sellerId: string,
    productId: string,
    imageIds: string[],
  ): Promise<string[]> {
    const current = await tx.select().from(productImages).where(eq(productImages.productId, productId));
    const wanted = new Set(imageIds);
    const removedKeys: string[] = [];
    const removedIds: string[] = [];
    for (const image of current) {
      if (!wanted.has(image.id)) {
        removedIds.push(image.id);
        removedKeys.push(image.largeKey, image.smallKey);
      }
    }
    if (removedIds.length > 0) {
      // Variants that used these photos have image_id set to null by the database.
      await tx.delete(productImages).where(inArray(productImages.id, removedIds));
    }
    await this.attachImages(tx, sellerId, productId, imageIds);
    return removedKeys;
  }


  private async syncVariants(tx: Tx, productId: string, input: VariantInput[]): Promise<void> {
    const existing = await tx
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.productId, productId), isNull(productVariants.archivedAt)));

    const byId = new Map<string, (typeof existing)[number]>();
    for (const row of existing) {
      byId.set(row.id, row);
    }

    // Matching, pass 1: variants that name a saved row by id claim it. Done before
    // anything else so an id-less variant can never take a row that has an owner.
    const matches: ((typeof existing)[number] | null)[] = [];
    const keptIds = new Set<string>();
    for (const variant of input) {
      let match: (typeof existing)[number] | null = null;
      if (variant.id !== undefined) {
        const found = byId.get(variant.id);
        if (!found || keptIds.has(found.id)) {
          throw new BadRequestException({
            message: "Validation failed",
            issues: {
              formErrors: [],
              fieldErrors: {
                variants: ["One of the options no longer exists. Reload to see the latest."],
              },
            },
          });
        }
        keptIds.add(found.id);
        match = found;
      }
      matches.push(match);
    }

    // Pass 2: a variant without an id may still be a saved row with the same
    // combination, but only one that nobody claimed in pass 1.
    const unclaimed = new Map<string, (typeof existing)[number]>();
    for (const row of existing) {
      if (!keptIds.has(row.id)) {
        unclaimed.set(row.optionValues.join("\u0000"), row);
      }
    }
    for (let i = 0; i < input.length; i++) {
      const variant = input[i];
      if (!variant || variant.id !== undefined) {
        continue;
      }
      const key = variant.optionValues.join("\u0000");
      const found = unclaimed.get(key);
      if (found) {
        unclaimed.delete(key);
        keptIds.add(found.id);
        matches[i] = found;
      }
    }

    // Saved variants that were left out: delete them, unless an order points at them.
    const dropped: string[] = [];
    for (const row of existing) {
      if (!keptIds.has(row.id)) {
        dropped.push(row.id);
      }
    }
    if (dropped.length > 0) {
      const orderedRows = await tx
        .select({ variantId: orderItems.variantId })
        .from(orderItems)
        .where(inArray(orderItems.variantId, dropped));
      const ordered = new Set<string>();
      for (const row of orderedRows) {
        if (row.variantId !== null) {
          ordered.add(row.variantId);
        }
      }
      for (const id of dropped) {
        if (ordered.has(id)) {
          // Kept for the order history. The unique index only covers live variants,
          // so its combination is free for a new variant to reuse.
          await tx
            .update(productVariants)
            .set({ archivedAt: new Date(), isEnabled: false })
            .where(eq(productVariants.id, id));
        } else {
          await tx.delete(productVariants).where(eq(productVariants.id, id));
        }
      }
    }

    // Two phases. The database checks "no two live variants share a combination" after
    // every single statement, so renaming S,M to M,L (or swapping them) one row at a
    // time would clash with a row that hasn't moved yet. Phase 1 parks every row whose
    // combination changes on a unique temporary value; phase 2 writes the final values.
    for (let i = 0; i < input.length; i++) {
      const variant = input[i];
      const match = matches[i];
      if (!variant || !match) {
        continue;
      }
      const changed = variant.optionValues.join("\u0000") !== match.optionValues.join("\u0000");
      if (changed) {
        await tx
          .update(productVariants)
          .set({ optionValues: ["__pending__", match.id] })
          .where(eq(productVariants.id, match.id));
      }
    }

    for (let i = 0; i < input.length; i++) {
      const variant = input[i];
      if (!variant) {
        continue;
      }
      const match = matches[i];
      if (match) {
        await tx
          .update(productVariants)
          .set({
            position: i,
            optionValues: variant.optionValues,
            title: variantTitle(variant.optionValues),
            priceKobo: variant.priceKobo,
            stock: variant.stock,
            imageId: variant.imageId,
            isEnabled: variant.isEnabled,
          })
          .where(eq(productVariants.id, match.id));
      } else {
        await this.insertVariant(tx, productId, variant, i);
      }
    }
  }
}
