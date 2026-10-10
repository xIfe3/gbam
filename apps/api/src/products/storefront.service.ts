import {
  productImages,
  productOptions,
  productVariants,
  products,
  sellers,
  shopSlugHistory,
} from "@gbam/db";
import { Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { DeliveryService } from "../settings/delivery.service.js";
import { PhotosService } from "./photos.service.js";
import { InjectPhotoStorage, type PhotoStorage } from "../integrations/integrations.module.js";
import { shopImageUrl } from "../settings/shop-images.service.js";

export type StorefrontProductCard = {
  slug: string;
  name: string;
  photoUrl: string | null;
  minPriceKobo: number;
  maxPriceKobo: number;
  soldOut: boolean;
};

@Injectable()
export class StorefrontService {
  // PhotosService is injected (not created here) so Nest hands us the one shared copy.
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly photos: PhotosService,
    private readonly delivery: DeliveryService,
    @InjectPhotoStorage() private readonly storage: PhotoStorage,
  ) {}

  /** The shop's logo and banner addresses (null = the default look). */
  private looks(seller: { logoKey: string | null; bannerKey: string | null }) {
    return {
      logoUrl: shopImageUrl(this.storage, seller.logoKey),
      bannerUrl: shopImageUrl(this.storage, seller.bannerKey),
    };
  }

  /** The shop's active products as cards. Products with nothing buyable are left out. */
  async list(slug: string) {
    const seller = await this.findSeller(slug);
    // Suspended: the page says the shop isn't taking orders, and shows nothing to buy.
    if (seller.suspendedAt !== null) {
      return {
        store: {
          slug,
          businessName: seller.businessName,
          ...this.looks(seller),
          delivery: { zones: [], pickupNote: null },
          suspended: true,
        },
        products: [],
      };
    }

    const productRows = await this.db
      .select({ id: products.id, slug: products.slug, name: products.name })
      .from(products)
      .where(and(eq(products.sellerId, seller.id), eq(products.status, "active")))
      .orderBy(asc(products.name));

    const productIds: string[] = [];
    for (const row of productRows) {
      productIds.push(row.id);
    }

    // One query for all variants and one for all main photos, instead of two per product.
    const variantsByProduct = new Map<string, { priceKobo: number; stock: number | null }[]>();
    const photoByProduct = new Map<string, string>();
    if (productIds.length > 0) {
      const variantRows = await this.db
        .select({
          productId: productVariants.productId,
          priceKobo: productVariants.priceKobo,
          stock: productVariants.stock,
        })
        .from(productVariants)
        .where(
          and(
            inArray(productVariants.productId, productIds),
            eq(productVariants.isEnabled, true),
            isNull(productVariants.archivedAt),
          ),
        );
      for (const variant of variantRows) {
        let list = variantsByProduct.get(variant.productId);
        if (!list) {
          list = [];
        }
        list.push({ priceKobo: variant.priceKobo, stock: variant.stock });
        variantsByProduct.set(variant.productId, list);
      }

      // Position 1 is the main photo.
      const imageRows = await this.db
        .select({
          productId: productImages.productId,
          largeKey: productImages.largeKey,
          smallKey: productImages.smallKey,
        })
        .from(productImages)
        .where(and(inArray(productImages.productId, productIds), eq(productImages.position, 1)));
      for (const image of imageRows) {
        if (image.productId) {
          photoByProduct.set(image.productId, this.photos.urlsFor(image).small);
        }
      }
    }

    const cards: StorefrontProductCard[] = [];
    for (const product of productRows) {
      const variants = variantsByProduct.get(product.id);
      if (!variants || variants.length === 0) {
        continue;
      }

      let minPriceKobo = Number.POSITIVE_INFINITY;
      let maxPriceKobo = 0;
      // Sold out only if EVERY variant is tracked and at 0; one untracked variant keeps it open.
      let soldOut = true;
      for (const variant of variants) {
        if (variant.priceKobo < minPriceKobo) {
          minPriceKobo = variant.priceKobo;
        }
        if (variant.priceKobo > maxPriceKobo) {
          maxPriceKobo = variant.priceKobo;
        }
        if (variant.stock !== 0) {
          soldOut = false;
        }
      }

      let photoUrl: string | null = null;
      const mainPhoto = photoByProduct.get(product.id);
      if (mainPhoto) {
        photoUrl = mainPhoto;
      }
      cards.push({
        slug: product.slug,
        name: product.name,
        photoUrl,
        minPriceKobo,
        maxPriceKobo,
        soldOut,
      });
    }

    // Checkout needs the shop's delivery zones (with prices) and its pickup note.
    const delivery = await this.delivery.get(seller.id);
    return {
      store: {
        slug,
        businessName: seller.businessName,
        ...this.looks(seller),
        delivery,
        suspended: false,
      },
      products: cards,
    };
  }

  /** One product page. Anything not visible to buyers is the same 404 as a missing product. */
  async product(slug: string, productSlug: string) {
    const seller = await this.findSeller(slug);
    if (seller.suspendedAt !== null) {
      throw new NotFoundException("Product not found");
    }

    // Filtering by sellerId too means another shop's product slug finds nothing here.
    const [product] = await this.db
      .select()
      .from(products)
      .where(
        and(
          eq(products.sellerId, seller.id),
          eq(products.slug, productSlug),
          eq(products.status, "active"),
        ),
      );
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const imageRows = await this.db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(asc(productImages.position));
    const images: { id: string; largeUrl: string; smallUrl: string }[] = [];
    for (const image of imageRows) {
      const urls = this.photos.urlsFor(image);
      images.push({ id: image.id, largeUrl: urls.large, smallUrl: urls.small });
    }

    const optionRows = await this.db
      .select({ name: productOptions.name, values: productOptions.values })
      .from(productOptions)
      .where(eq(productOptions.productId, product.id))
      .orderBy(asc(productOptions.position));

    const variantRows = await this.db
      .select()
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, product.id),
          eq(productVariants.isEnabled, true),
          isNull(productVariants.archivedAt),
        ),
      )
      .orderBy(asc(productVariants.position));
    const variants: {
      id: string;
      optionValues: string[];
      title: string;
      priceKobo: number;
      stock: number | null;
      imageId: string | null;
    }[] = [];
    for (const variant of variantRows) {
      variants.push({
        id: variant.id,
        optionValues: variant.optionValues,
        title: variant.title,
        priceKobo: variant.priceKobo,
        stock: variant.stock,
        imageId: variant.imageId,
      });
    }

    return {
      store: { slug, businessName: seller.businessName, ...this.looks(seller) },
      product: {
        slug: product.slug,
        name: product.name,
        description: product.description,
        images,
        options: optionRows,
        variants,
      },
    };
  }

  private async findSeller(slug: string) {
    const [seller] = await this.db
      .select({
        id: sellers.id,
        businessName: sellers.businessName,
        suspendedAt: sellers.suspendedAt,
        logoKey: sellers.logoKey,
        bannerKey: sellers.bannerKey,
      })
      .from(sellers)
      // A closed shop (owner deleted the account) looks the same as one that never existed.
      .where(and(eq(sellers.slug, slug), isNull(sellers.closedAt)));
    if (!seller) {
      // An old link of a shop that changed its link: tell the website where it moved, so it
      // can redirect (links shared on WhatsApp statuses keep working).
      const moved = await this.db
        .select({ slug: sellers.slug })
        .from(shopSlugHistory)
        .innerJoin(sellers, eq(sellers.id, shopSlugHistory.sellerId))
        .where(and(eq(shopSlugHistory.slug, slug), isNull(sellers.closedAt)));
      const current = moved[0];
      if (current) {
        throw new NotFoundException({
          statusCode: 404,
          message: "This shop has a new link",
          code: "SHOP_MOVED",
          slug: current.slug,
        });
      }
      throw new NotFoundException("Store not found");
    }
    return seller;
  }
}
