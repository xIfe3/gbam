import { products, sellers } from "@gbam/db";
import { Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";

@Injectable()
export class StorefrontService {
  constructor(@InjectDb() private readonly db: Db) {}

  async storefront(slug: string) {
    const [seller] = await this.db
      .select({ id: sellers.id, businessName: sellers.businessName })
      .from(sellers)
      .where(eq(sellers.slug, slug));
    if (!seller) throw new NotFoundException("Store not found");

    const items = await this.db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        priceKobo: products.priceKobo,
      })
      .from(products)
      .where(and(eq(products.sellerId, seller.id), eq(products.isActive, true)))
      .orderBy(asc(products.name));

    return { store: { slug, businessName: seller.businessName }, products: items };
  }
}
