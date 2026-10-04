CREATE TYPE "public"."product_status" AS ENUM('active', 'hidden', 'archived');--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"product_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"large_key" text NOT NULL,
	"small_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"values" text[] NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"option_values" text[] DEFAULT '{}' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"price_kobo" bigint NOT NULL,
	"stock" integer,
	"image_id" uuid,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stock_shortfall" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "status" "product_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_image_id_product_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."product_images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_images_seller_idx" ON "product_images" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "product_options_product_idx" ON "product_options" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_product_values_idx" ON "product_variants" USING btree ("product_id","option_values");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Hand-written backfill for existing rows. Order matters: slug is added nullable above,
-- filled here, made NOT NULL, and only then given its unique index.
-- Slug = the name lowercased, with runs of other characters turned into "-". A base of
-- "order" becomes "order-1" because /[shop]/order is a reserved route. Products in the
-- same shop with the same base get a -2, -3 suffix (oldest keeps the plain slug).
UPDATE "products" p SET "slug" = s.base || CASE WHEN s.n = 1 THEN '' ELSE '-' || s.n END
FROM (
  SELECT id, base, row_number() OVER (PARTITION BY seller_id, base ORDER BY created_at, id) AS n
  FROM (
    SELECT id, seller_id, created_at,
           CASE
             WHEN raw_base = 'order' THEN 'order-1'
             ELSE raw_base
           END AS base
    FROM (
      SELECT id, seller_id, created_at,
             coalesce(nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''), 'product') AS raw_base
      FROM "products"
    ) r
  ) b
) s WHERE p.id = s.id;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "products_seller_slug_idx" ON "products" USING btree ("seller_id","slug");--> statement-breakpoint
UPDATE "products" SET "status" = 'hidden' WHERE "is_active" = false;--> statement-breakpoint
-- One default variant (no options) per existing product, carrying its price and stock.
INSERT INTO "product_variants" ("product_id", "position", "option_values", "title", "price_kobo", "stock")
SELECT "id", 0, '{}', '', "price_kobo", "stock" FROM "products";--> statement-breakpoint
UPDATE "order_items" oi SET "variant_id" = v."id"
FROM "product_variants" v
WHERE oi."product_id" = v."product_id" AND v."option_values" = '{}';