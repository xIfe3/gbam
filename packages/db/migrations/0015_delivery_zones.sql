CREATE TABLE "delivery_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"name" text NOT NULL,
	"fee_kobo" integer NOT NULL,
	"is_pickup" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "subtotal_kobo" bigint;--> statement-breakpoint
-- Orders placed before delivery fees existed: the total was all items.
UPDATE "orders" SET "subtotal_kobo" = "total_kobo";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "subtotal_kobo" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_fee_kobo" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_zone_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_is_pickup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_landmark" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "pickup_note" text;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_zones_seller_idx" ON "delivery_zones" USING btree ("seller_id");