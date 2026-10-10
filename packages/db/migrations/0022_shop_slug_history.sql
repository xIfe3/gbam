CREATE TABLE "shop_slug_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_slug_history_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "slug_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_slug_history" ADD CONSTRAINT "shop_slug_history_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;